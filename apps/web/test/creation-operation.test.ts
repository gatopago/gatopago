import { afterEach, describe, expect, it, vi } from 'vitest';
import environments from '@gatopago/environment/environments.json';
import { parseEnvironment } from '@gatopago/environment';
import { createResourceId } from '@gatopago/shared/v3/primitives';
import { prepareInitialization } from '@gatopago/shared/v3/initialization';
import { prepareCreationOperation } from '@gatopago/shared/v3/creation-operation';
import { creationGasWire, parseCreationPreview } from '@gatopago/shared/v3/creation-operation-wire';
import { parseInitializationPreparation } from '@gatopago/shared/v3/initialization-wire';
import { CLIENT_RELEASE_HEADERS } from '@gatopago/shared/v3/client-release';
import { creationOperationClient } from '../src/wallet/creation-operation';
import { buildAuthConfig, type EnabledAuthConfig } from '../src/auth/config';
import { initializationFixture } from '@gatopago/test-fixtures/v3-initialization';
import { fixtureHash } from '@gatopago/test-fixtures/v3-inspection';

const config = buildAuthConfig(parseEnvironment({ ...environments.staging, status: 'provisioned', firebase_project_id: 'v3-runtime-test' }), {
  apiKey: `AIza${'a'.repeat(35)}`, appId: '1:123:web:abcdef', turnstileSiteKey: `0x${'a'.repeat(22)}`,
}) as EnabledAuthConfig;
const signal = () => new AbortController().signal;
const encode = (p: ReturnType<ReturnType<typeof initializationFixture>['assertion']>) => ({ authenticator_data: Buffer.from(p.authenticatorData).toString('base64url'),
  client_data: Buffer.from(p.clientDataJSON).toString('base64url'), signature: Buffer.from(p.signatureDER).toString('base64url') });
function fixture() {
  const f = initializationFixture(), id = createResourceId('operation'), credentialRef = createResourceId('operation');
  const initial = prepareInitialization(f.input), initialProof = f.assertion(initial.digest);
  const expected = { id, credentialRef, document: f.pin.document, profileDigest: f.pin.digest,
    userSaltCommitment: f.input.userSaltCommitment, scope: f.input.scope };
  const preparation = parseInitializationPreparation({ initialization_id: id, state: 'authorized', approval_digest: initial.digest,
    profile_sha256: f.pin.digest, account_deployed: false, receive_enabled: false, spend_enabled: false,
    credential_ref: credentialRef, credential_id: Buffer.from('test-key').toString('base64url'), public_key: f.input.publicKey,
    valid_after: f.input.validAfter, valid_until: f.input.validUntil }, expected);
  const consent = { preparation, expected }, terms = { verificationGasLimit: 2_000_000n, callGasLimit: 100_000n, preVerificationGas: 150_000n,
    maxFeePerGas: 1_000_000_000n, maxPriorityFeePerGas: 0n, maximumGasCharge: 2_250_000_000_000_000n };
  const candidate = prepareCreationOperation(f.input, initialProof, terms, f.input.validAfter);
  const receipt = { initialization_id: id, state: 'prepared', user_op_hash: candidate.userOpHash, operation_digest: candidate.digest,
    expires_at: f.input.validUntil, authorization_expired: false, delivery_state: 'not_requested', deployment_assessment: 'not_assessed', receive_enabled: false, spend_enabled: false };
  const value = { observed_at: f.input.validAfter, receipt, gas_terms: creationGasWire(terms), initial_assertion: encode(initialProof),
    lifecycle: { job_state: 'not_requested', reason: null, observation: null, bootstrap: null, account_readiness: 'not_assessed' } };
  const token = vi.fn(async () => 'synthetic.token.signature');
  return { f, id, consent, terms, candidate, value, token, proof: encode(f.assertion(candidate.digest)),
    client: creationOperationClient(config, token, f.pin), authorized: { ...receipt, state: 'authorized', delivery_state: 'pending' } };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('creation resource client and deterministic wire validation', () => {
  it('does no I/O on construction and sends only an explicit atomic-unit cap', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); const t = fixture();
    expect(fetchMock).not.toHaveBeenCalled(); expect(t.token).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue(Response.json(t.value));
    const review = await t.client.prepare(t.consent, t.terms.maximumGasCharge.toString(), signal());
    expect(review.preview.candidate).toEqual(t.candidate);
    expect(fetchMock).toHaveBeenCalledWith(`${environments.staging.api_origin}/app/v1/account-initializations/${t.id}/creation-operation`, expect.objectContaining({
      method: 'POST', body: JSON.stringify({ maximum_gas_charge: t.terms.maximumGasCharge.toString() }), cache: 'no-store', credentials: 'omit', redirect: 'error',
      headers: expect.objectContaining({ [CLIENT_RELEASE_HEADERS.generation]: '3' }),
    }));
  });
  it('restores only by GET and requires the separate operation signature', async () => {
    const t = fixture(), fetchMock = vi.fn().mockResolvedValueOnce(Response.json(t.value)).mockResolvedValueOnce(Response.json(t.authorized)); vi.stubGlobal('fetch', fetchMock);
    const review = await t.client.restore(t.consent, signal());
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET', headers: { [CLIENT_RELEASE_HEADERS.generation]: 'none' } });
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
    expect(await t.client.authorize(t.consent, review, t.proof, signal())).toEqual(t.authorized);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(t.proof); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each(['digest', 'hash', 'salt', 'scope', 'key', 'lifetime', 'proof', 'gas', 'number', 'extra', 'receive', 'deployed', 'expiry', 'delivery'])('refuses altered %s before a signing UI can use the preview', (change) => {
    const t = fixture(), value = structuredClone(t.value), selected = structuredClone(t.consent);
    if (change === 'digest') value.receipt.operation_digest = fixtureHash('a');
    if (change === 'hash') value.receipt.user_op_hash = fixtureHash('a');
    if (change === 'salt') selected.expected.userSaltCommitment = fixtureHash('a');
    if (change === 'scope') selected.expected.scope.origin = 'https://gatopago.com';
    if (change === 'key') selected.preparation = { ...selected.preparation, public_key: initializationFixture().input.publicKey };
    if (change === 'lifetime') value.receipt.expires_at += 300;
    if (change === 'proof') value.initial_assertion = encode(initializationFixture().assertion(t.candidate.prepared.digest));
    if (change === 'gas') Object.assign(value.gas_terms, { maxFeePerGas: '1' });
    if (change === 'number') Object.assign(value.gas_terms, { maximumGasCharge: 1 });
    if (change === 'extra') Object.assign(value, { paymaster: '0x1234' });
    if (change === 'receive') value.receipt.receive_enabled = true;
    if (change === 'deployed') value.receipt.deployment_assessment = 'recognized';
    if (change === 'expiry') value.receipt.authorization_expired = true;
    if (change === 'delivery') value.receipt.delivery_state = 'accepted';
    expect(() => parseCreationPreview(value, selected)).toThrow();
  });
  it('never accepts the initial consent signature as an operation signature or trusts a mutated view', async () => {
    const t = fixture(), fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const review = { wire: t.value };
    await expect(t.client.authorize(t.consent, review, t.value.initial_assertion, signal())).rejects.toThrow();
    t.value.receipt.operation_digest = fixtureHash('a');
    await expect(t.client.authorize(t.consent, review, t.proof, signal())).rejects.toThrow(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('requires the selected release pin and original scope before acquiring a token', async () => {
    const t = fixture(), fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(t.client.restore({ ...t.consent, expected: { ...t.consent.expected, document: '{}' } }, signal())).rejects.toThrow();
    await expect(t.client.restore({ ...t.consent, expected: { ...t.consent.expected, scope: { rpId: 'gatopago.com', origin: 'https://gatopago.com' } } }, signal())).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled(); expect(t.token).not.toHaveBeenCalled();
  });
  it('refuses noncanonical caps before I/O and a provider response with another approved cap', async () => {
    const t = fixture(), fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    for (const bad of ['0', '01', '1e5', ' 123', '-1', (1n << 256n).toString()]) await expect(t.client.prepare(t.consent, bad, signal())).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled(); fetchMock.mockResolvedValue(Response.json(t.value));
    await expect(t.client.prepare(t.consent, (t.terms.maximumGasCharge + 1n).toString(), signal())).rejects.toMatchObject({ code: 'creation/invalid' });
  });
  it('can inspect expired history but does not sign a stale prepared operation', async () => {
    const t = fixture(); t.value.observed_at = t.f.input.validUntil; t.value.receipt.authorization_expired = true;
    const fetchMock = vi.fn().mockResolvedValue(Response.json(t.value)); vi.stubGlobal('fetch', fetchMock);
    const review = await t.client.restore(t.consent, signal());
    await expect(t.client.authorize(t.consent, review, t.proof, signal())).rejects.toMatchObject({ code: 'creation/expired' }); expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each([400, 404, 409, 410, 422, 429, 503])('does not retry or create a new initialization after status %s', async (status) => {
    const t = fixture(), fetchMock = vi.fn().mockResolvedValue(Response.json({ error_code: 'test' }, { status })); vi.stubGlobal('fetch', fetchMock);
    await expect(t.client.prepare(t.consent, t.terms.maximumGasCharge.toString(), signal())).rejects.toThrow(); expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('does not accept a prepared or mismatched authorization response', async () => {
    const t = fixture(), fetchMock = vi.fn().mockResolvedValueOnce(Response.json(t.value.receipt)).mockResolvedValueOnce(Response.json({ ...t.authorized, user_op_hash: fixtureHash('c') }));
    vi.stubGlobal('fetch', fetchMock);
    for (let index = 0; index < 2; index++) await expect(t.client.authorize(t.consent, { wire: t.value }, t.proof, signal())).rejects.toMatchObject({ code: 'creation/invalid' });
  });
  it('detaches consent and proof before waiting for a Firebase token', async () => {
    const t = fixture(); let release!: (value: string) => void;
    t.token.mockImplementation(() => new Promise<string>((resolve) => { release = resolve; }));
    const fetchMock = vi.fn().mockResolvedValue(Response.json(t.authorized)); vi.stubGlobal('fetch', fetchMock);
    const pending = t.client.authorize(t.consent, { wire: t.value }, t.proof, signal()), original = { ...t.proof };
    t.proof.signature = 'changed'; t.consent.expected.id = createResourceId('operation'); release('test.token.signature');
    expect(await pending).toEqual(t.authorized); expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(original);
  });
});
