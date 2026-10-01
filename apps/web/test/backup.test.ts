import { afterEach, describe, expect, it, vi } from 'vitest';
import environments from '@gatopago/environment/environments.json';
import { parseEnvironment } from '@gatopago/environment';
import { parseBackupPreview, parseBackupCommitPreview } from '@gatopago/shared/v3/backup-wire';
import { CLIENT_RELEASE_HEADERS } from '@gatopago/shared/v3/client-release';
import { prepareBackupEnrollment, prepareBackupCommit } from '@gatopago/shared/v3/backup-enrollment';
import { buildAuthConfig, type EnabledAuthConfig } from '../src/auth/config';
import { backupClient } from '../src/wallet/backup';
import { backupWireFixture } from './backup.fixture';
import { fixtureHash } from '@gatopago/test-fixtures/v3-deployment-fixture';
import { initializationFixture } from '@gatopago/test-fixtures/v3-initialization';
import { signerId } from '@gatopago/shared/v3/security-policy';

const config = buildAuthConfig(parseEnvironment({ ...environments.staging, status: 'provisioned', firebase_project_id: 'v3-runtime-test' }), {
  apiKey: `AIza${'a'.repeat(35)}`, appId: '1:123:web:abcdef', turnstileSiteKey: `0x${'a'.repeat(22)}`,
}) as EnabledAuthConfig;
const signal = () => new AbortController().signal;
function fixture() {
  const t = backupWireFixture(), token = vi.fn(async () => 'synthetic.token.signature'), fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  return { ...t, token, fetchMock, client: backupClient(config, token, t.f.pin) };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('backup resource client, independently pinned consent and explicit signatures', () => {
  it.each(['prepare','commit'] as const)('reads %s progress with GET only and binds the response to the reviewed proposal', async (kind) => {
    const t = fixture(), c = t.commit(), id = kind === 'commit' ? c.commitId : t.choice.backupId;
    const progress = { schema_version: 1, backup_id: t.choice.backupId, operation_id: id, kind,
      proposal_hash: t.compiled.digest, consent_state: 'authorized', delivery_state: 'pending', transaction_hash: null,
      job_state: 'ready', reason: null, observation: null, policy_confirmation: null, account_readiness: 'not_assessed', snapshot_at: t.f.input.validAfter };
    t.fetchMock.mockResolvedValueOnce(Response.json(progress)).mockResolvedValueOnce(Response.json({ ...progress, operation_id: t.choice.walletId }));
    const result = await t.client.status(t.choice, t.parent, kind === 'commit' ? id : null, signal());
    expect(result).toEqual(progress); expect(t.fetchMock.mock.calls[0][1].method).toBe('GET');
    expect(t.fetchMock.mock.calls[0][0]).toContain(kind === 'commit' ? `/commits/${id}/status` : `/${id}/status`);
    await expect(t.client.status(t.choice, t.parent, kind === 'commit' ? id : null, signal())).rejects.toMatchObject({ code: 'backup/invalid' });
    expect(t.fetchMock).toHaveBeenCalledTimes(2);
  });
  it('exports and verifies external proofs locally without token acquisition, then submits through the existing authorized route', async () => {
    const t = fixture(), review = { wire: t.wire }, now = t.f.input.validAfter;
    vi.spyOn(Date, 'now').mockReturnValue(now * 1000);
    const index = t.compiled.enrollments.find((p) => t.compiled.nextPolicy.signers[p.signerIndex].kind === 0)!.signerIndex;
    const request = t.client.externalProofRequest(t.choice, review, index);
    const key = t.f.keys.find((key) => key.address.toLowerCase() === request.summary.signer_address)!;
    const signature = await key.signTypedData(request.typedData);
    const text = JSON.stringify({ schema_version: 1, purpose: 'gatopago-v3-enrollment-proof', backup_id: t.choice.backupId,
      signer_index: index, digest: request.summary.digest, signature });
    const imported = await t.client.importExternalProof(t.choice, review, index, text, signal());
    expect(t.token).not.toHaveBeenCalled(); expect(t.fetchMock).not.toHaveBeenCalled();
    const proofs = (await t.f.proofs()).map((proof) => proof.signerIndex === index ? imported : proof);
    t.fetchMock.mockResolvedValue(Response.json(t.authorized));
    const receipt = await t.client.authorize(t.choice, review, t.f.assertion(t.compiled.digest), proofs, signal());
    expect(receipt.state).toBe('authorized'); expect(receipt.spend_enabled).toBe(false);
    expect(t.fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(t.fetchMock.mock.calls[0][1].body).enrollments).toContainEqual({ kind: 'ecdsa', signer_index: index, signature });
  });
  it('does not export fresh proofs from an expired or unapproved review, and bounds local imports by abort', async () => {
    const t = fixture(), index = t.compiled.enrollments[0].signerIndex;
    vi.spyOn(Date, 'now').mockReturnValue(t.f.input.validUntil * 1000);
    expect(() => t.client.externalProofRequest(t.choice, { wire: t.wire }, index)).toThrow();
    const abort = new AbortController(); abort.abort();
    await expect(t.client.importExternalProof(t.choice, { wire: t.wire }, index, '{}', abort.signal)).rejects.toThrow();
    expect(t.token).not.toHaveBeenCalled(); expect(t.fetchMock).not.toHaveBeenCalled();
  });
  it('has no construction I/O and POSTs only the exact selected resources, policy and deadline', async () => {
    const t = fixture(); expect(t.token).not.toHaveBeenCalled(); expect(t.fetchMock).not.toHaveBeenCalled();
    t.fetchMock.mockResolvedValue(Response.json(t.wire));
    const review = await t.client.prepare(t.choice, signal());
    expect(review.preview.compiled).toEqual(t.compiled);
    expect(t.fetchMock).toHaveBeenCalledWith(`${environments.staging.api_origin}/app/v1/account-backups`, expect.objectContaining({
      method: 'POST', cache: 'no-store', credentials: 'omit', redirect: 'error', headers: expect.objectContaining({ [CLIENT_RELEASE_HEADERS.generation]: '3' }),
      body: JSON.stringify({ request_id: t.choice.backupId, initialization_id: t.choice.consent.preparation.initialization_id,
        wallet_id: t.choice.walletId, wallet_account_id: t.choice.walletAccountId, next_policy: t.choice.nextPolicy, proposal_valid_until: t.choice.proposalValidUntil }),
    }));
    expect(review.preview.receipt.receive_enabled).toBe(false); expect(review.preview.compiled.continuity.sovereign_readiness).toBe('not_assessed');
  });
  it('GET reads do not sign or renew consent; owner and enrollment proofs are separate', async () => {
    const t = fixture(); t.fetchMock.mockResolvedValueOnce(Response.json(t.wire)).mockResolvedValueOnce(Response.json(t.authorized));
    const review = await t.client.restore(t.choice, signal());
    expect(t.fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET', headers: { [CLIENT_RELEASE_HEADERS.generation]: 'none' } });
    const owner = t.f.assertion(t.compiled.digest), proofs = await t.f.proofs();
    expect(await t.client.authorize(t.choice, review, owner, proofs, signal())).toEqual(t.authorized);
    const body = JSON.parse(t.fetchMock.mock.calls[1][1].body);
    expect(Object.keys(body)).toEqual(['owner', 'enrollments']); expect(body.enrollments).toHaveLength(2);
    expect(body.enrollments[0]).toEqual({ kind: 'ecdsa', signer_index: proofs[0].signerIndex, signature: 'signature' in proofs[0] ? proofs[0].signature : '' });
    expect(t.fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each(['identity', 'wallet', 'walletAccount', 'document', 'pin', 'origin', 'key', 'salt', 'initialWindow', 'policy', 'deadline', 'digest',
    'manifest', 'implementation', 'layout', 'nonce', 'checkpoint', 'pending', 'scope', 'extra', 'nestedExtra', 'ready', 'amountEncoding'])('rejects changed %s in a response', async (change) => {
    const t = fixture(), wire = structuredClone(t.wire), i = wire.input, o = i.observation;
    if (change === 'identity') Object.assign(wire, { initialization_id: t.choice.backupId });
    if (change === 'wallet') Object.assign(wire, { wallet_id: t.choice.walletAccountId });
    if (change === 'walletAccount') Object.assign(wire, { wallet_account_id: t.choice.walletId });
    if (change === 'document') Object.assign(i.initialization, { document: i.initialization.document + ' ' });
    if (change === 'pin') Object.assign(i.initialization, { expectedDigest: fixtureHash('a') });
    if (change === 'origin') Object.assign(i.initialization, { scope: { ...i.initialization.scope, origin: 'https://example.test' } });
    if (change === 'key') Object.assign(i.initialization, { publicKey: `0x${'00'.repeat(128)}` });
    if (change === 'salt') Object.assign(i.initialization, { userSaltCommitment: fixtureHash('a') });
    if (change === 'initialWindow') Object.assign(i.initialization, { validUntil: i.initialization.validUntil - 1 });
    if (change === 'policy') i.nextPolicy.upgradeDelaySeconds++;
    if (change === 'deadline') { Object.assign(i, { proposalValidUntil: i.proposalValidUntil + 1 }); wire.proposal_valid_until++; }
    if (change === 'digest') wire.proposal_hash = fixtureHash('a');
    if (change === 'manifest') o.manifest_id += '-changed';
    if (change === 'implementation') o.implementation = `0x${'1'.repeat(40)}`;
    if (change === 'layout') o.storage_layout_hash = fixtureHash('a');
    if (change === 'nonce') o.security.nonces.admin = '2';
    if (change === 'checkpoint') Object.assign(o.checkpoint, { block_hash: '0x00' });
    if (change === 'pending') o.security.pending = t.f.pending().security.pending;
    if (change === 'scope') o.security.chain_scope_hash = fixtureHash('a');
    if (change === 'extra') Object.assign(wire, { approved: true });
    if (change === 'nestedExtra') Object.assign(o.security, { finality: 'trusted' });
    if (change === 'ready') Object.assign(wire, { receive_enabled: true });
    if (change === 'amountEncoding') o.security.nonces.spend = '00';
    t.fetchMock.mockResolvedValue(Response.json(wire));
    await expect(t.client.restore(t.choice, signal())).rejects.toMatchObject({ code: 'backup/invalid' });
    expect(t.fetchMock).toHaveBeenCalledTimes(1);
  });
  it('accepts reordered JSON keys but not a response that chooses its own valid policy and hashes', () => {
    const t = fixture(), reordered = Object.fromEntries(Object.entries(t.wire).reverse());
    expect(parseBackupPreview(reordered, t.choice).compiled.digest).toBe(t.compiled.digest);
    const changed = structuredClone(t.wire); changed.input.nextPolicy.upgradeDelaySeconds++;
    const recomputed = prepareBackupEnrollment(changed.input, changed.input.validAfter);
    changed.proposal_hash = recomputed.digest; changed.expected_manifest_hash = recomputed.expectedManifestHash;
    expect(() => parseBackupPreview(changed, t.choice)).toThrow();
  });
  it.each(['owner', 'missing', 'duplicate', 'wrongKey', 'kind'])('rejects %s proofs locally before sending them', async (change) => {
    const t = fixture(), proofs = await t.f.proofs(); let owner = t.f.assertion(t.compiled.digest);
    if (change === 'owner') owner = t.f.assertion(t.f.initial.digest);
    if (change === 'missing') proofs.pop();
    if (change === 'duplicate') proofs[1] = proofs[0];
    if (change === 'wrongKey') { const p = proofs[0]; if (p.kind === 'ecdsa') proofs[0] = { ...p, signature: await t.f.keys.find((k) => k.address.toLowerCase() !== t.choice.nextPolicy.signers[p.signerIndex].key)!.sign({ hash: t.compiled.enrollments[0].digest }) }; }
    if (change === 'kind') proofs[0] = { kind: 'webauthn', signerIndex: proofs[0].signerIndex, assertion: owner };
    await expect(t.client.authorize(t.choice, { wire: t.wire }, owner, proofs, signal())).rejects.toMatchObject({ code: 'backup/invalid' });
    expect(t.token).not.toHaveBeenCalled(); expect(t.fetchMock).not.toHaveBeenCalled();
  });
  it.each([-1, 300])('keeps history readable but prevents a fresh signature outside its window (%s seconds)', async (offset) => {
    const t = fixture(), owner = t.f.assertion(t.compiled.digest), proofs = await t.f.proofs();
    vi.useFakeTimers(); vi.setSystemTime((t.f.input.validAfter + offset) * 1000);
    t.fetchMock.mockResolvedValue(Response.json(t.wire)); const review = await t.client.restore(t.choice, signal());
    await expect(t.client.authorize(t.choice, review, owner, proofs, signal())).rejects.toMatchObject({ code: 'backup/expired' });
    expect(t.fetchMock).toHaveBeenCalledTimes(1);
  });
  it('does not change an already authorized retry or extend its old window', async () => {
    const t = fixture(), owner = t.f.assertion(t.compiled.digest), proofs = await t.f.proofs();
    vi.useFakeTimers(); vi.setSystemTime((t.f.input.validUntil + 1) * 1000);
    t.fetchMock.mockResolvedValue(Response.json(t.authorized));
    expect(await t.client.authorize(t.choice, t.parent, owner, proofs, signal())).toEqual(t.authorized);
    expect(t.fetchMock.mock.calls[0][0]).toContain(`${t.choice.backupId}/authorize`);
    expect(JSON.parse(t.fetchMock.mock.calls[0][1].body)).not.toHaveProperty('valid_until');
  });
  it('requires the new WebAuthn factor itself to prove possession, not another signature by the owner', async () => {
    const t = fixture(), backup = initializationFixture(), input = structuredClone(t.f.input);
    input.nextPolicy.signers = [...input.nextPolicy.signers, { ...t.f.initial.policy.signers[0], key: backup.input.publicKey }]
      .sort((a, b) => signerId(a).localeCompare(signerId(b)));
    const choice = { ...t.choice, nextPolicy: input.nextPolicy }, compiled = prepareBackupEnrollment(input, input.validAfter);
    const receipt = { ...t.receipt, proposal_hash: compiled.digest, expected_manifest_hash: compiled.expectedManifestHash };
    const review = { wire: { ...receipt, input } }, owner = t.f.assertion(compiled.digest), proofs = await t.f.proofs(input);
    await expect(t.client.authorize(choice, review, owner, proofs, signal())).rejects.toMatchObject({ code: 'backup/invalid' });
    expect(t.fetchMock).not.toHaveBeenCalled();
    const request = compiled.enrollments.find((e) => input.nextPolicy.signers[e.signerIndex].key === backup.input.publicKey)!;
    const index = proofs.findIndex((p) => p.signerIndex === request.signerIndex);
    proofs[index] = { kind: 'webauthn', signerIndex: request.signerIndex, assertion: backup.assertion(request.digest) };
    t.fetchMock.mockResolvedValue(Response.json({ ...receipt, state: 'authorized' }));
    expect(await t.client.authorize(choice, review, owner, proofs, signal())).toMatchObject({ state: 'authorized', receive_enabled: false });
    const sent = JSON.parse(t.fetchMock.mock.calls[0][1].body).enrollments.find((p: { signer_index: number }) => p.signer_index === request.signerIndex);
    expect(sent.kind).toBe('webauthn'); expect(Object.keys(sent.assertion).sort()).toEqual(['authenticator_data', 'client_data', 'signature']);
  });
  it('revalidates wire before authorization even if callers modify a returned preview', async () => {
    const t = fixture(); t.fetchMock.mockResolvedValue(Response.json(t.wire));
    const review = await t.client.restore(t.choice, signal());
    Object.assign((review.wire as typeof t.wire).input.nextPolicy, { upgradeDelaySeconds: t.choice.nextPolicy.upgradeDelaySeconds + 1 });
    await expect(t.client.authorize(t.choice, review, t.f.assertion(t.compiled.digest), await t.f.proofs(), signal())).rejects.toMatchObject({ code: 'backup/invalid' });
    expect(t.fetchMock).toHaveBeenCalledTimes(1);
  });
  it('fits a full sixteen-WebAuthn-factor policy inside the existing bounded transport', async () => {
    const t = fixture(), input = structuredClone(t.f.input), initial = t.f.initial.policy.signers[0];
    input.nextPolicy.signers = [initial, ...Array.from({ length: 15 }, () => ({ ...initial,
      key: initializationFixture().input.publicKey, roles: 3 }))].sort((a, b) => signerId(a).localeCompare(signerId(b)));
    const compiled = prepareBackupEnrollment(input, input.validAfter), choice = { ...t.choice, nextPolicy: input.nextPolicy };
    const raw = { ...t.wire, input, proposal_hash: compiled.digest, expected_manifest_hash: compiled.expectedManifestHash, state: 'authorized' };
    expect(new TextEncoder().encode(JSON.stringify(raw)).length).toBeLessThan(32768);
    t.fetchMock.mockResolvedValue(Response.json(raw));
    const reviewed = await t.client.restore(choice, signal()); expect(reviewed.preview.compiled.enrollments).toHaveLength(15);
    const observation = t.f.pending(input), c = t.commit(), commit = prepareBackupCommit(input, observation, c.receipt.valid_after, c.receipt.valid_until, c.receipt.valid_after);
    const commitRaw = { ...c.wire, input, observation, proposal_hash: compiled.digest, commit_digest: commit.digest };
    expect(new TextEncoder().encode(JSON.stringify(commitRaw)).length).toBeLessThan(32768);
    t.fetchMock.mockResolvedValue(Response.json(commitRaw));
    expect((await t.client.restoreCommit(choice, reviewed, c.commitId, signal())).preview.compiled.digest).toBe(commit.digest);
  });
  it('detaches selected policy and reviewed wire before token refresh', async () => {
    const t = fixture(); let resolve!: (token: string) => void;
    const client = backupClient(config, () => new Promise((done) => { resolve = done; }), t.f.pin);
    t.fetchMock.mockResolvedValue(Response.json(t.wire));
    const task = client.prepare(t.choice, signal()); t.choice.nextPolicy.upgradeDelaySeconds++; t.choice.proposalValidUntil++;
    resolve('synthetic.token.signature');
    const result = await task; expect(result.preview.receipt.proposal_valid_until).toBe(t.wire.proposal_valid_until);
    expect(JSON.parse(t.fetchMock.mock.calls[0][1].body).next_policy).toEqual(t.wire.input.nextPolicy);
  });
  it.each([400, 404, 409, 410, 429, 503])('keeps HTTP %s terminal without automatic retry', async (status) => {
    const t = fixture(); t.fetchMock.mockResolvedValue(Response.json({}, { status }));
    await expect(t.client.restore(t.choice, signal())).rejects.toHaveProperty('code'); expect(t.fetchMock).toHaveBeenCalledTimes(1);
  });
  it('refuses a caller with a different release pin and an already aborted request', async () => {
    const t = fixture(), changed = structuredClone(t.choice);
    changed.consent.expected.profileDigest = fixtureHash('a');
    await expect(t.client.prepare(changed, signal())).rejects.toMatchObject({ code: 'backup/invalid' });
    const controller = new AbortController(); controller.abort();
    await expect(t.client.prepare(t.choice, controller.signal)).rejects.toThrow(); expect(t.fetchMock).not.toHaveBeenCalled();
  });
  it('separately prepares, restores and authorizes a commit after the first consent window', async () => {
    const t = fixture(), c = t.commit(t.f.input.validUntil + 5);
    vi.useFakeTimers(); vi.setSystemTime(c.receipt.valid_after * 1000);
    t.fetchMock.mockResolvedValueOnce(Response.json(c.wire)).mockResolvedValueOnce(Response.json(c.wire)).mockResolvedValueOnce(Response.json(c.authorized));
    const review = await t.client.prepareCommit(t.choice, t.parent, c.commitId, signal());
    expect(review.preview.compiled.digest).toBe(c.compiled.digest); expect(c.compiled.digest).not.toBe(t.compiled.digest);
    expect(await t.client.restoreCommit(t.choice, t.parent, c.commitId, signal())).toEqual(review);
    expect(t.fetchMock.mock.calls[1][1].method).toBe('GET');
    await expect(t.client.authorizeCommit(t.choice, t.parent, review, c.commitId, t.f.assertion(t.compiled.digest), signal())).rejects.toMatchObject({ code: 'backup/invalid' });
    expect(t.fetchMock).toHaveBeenCalledTimes(2);
    expect(await t.client.authorizeCommit(t.choice, t.parent, review, c.commitId, t.f.assertion(c.compiled.digest), signal())).toEqual(c.authorized);
    expect(JSON.parse(t.fetchMock.mock.calls[0][1].body)).toEqual({ request_id: c.commitId });
    expect(t.fetchMock.mock.calls[2][0]).toContain(`/commits/${c.commitId}/authorize`);
  });
  it.each(['parent', 'input', 'id', 'nonce', 'block', 'proposal', 'expiry', 'kind', 'readiness'])('rejects commit %s substitution', (change) => {
    const t = fixture(), c = t.commit(), raw = structuredClone(c.wire);
    if (change === 'parent') raw.backup_id = c.commitId;
    if (change === 'input') Object.assign(raw.input.observation.checkpoint, { block_number: '99' });
    if (change === 'id') raw.commit_id = t.choice.backupId;
    if (change === 'nonce') raw.observation.security.nonces.admin = '0';
    if (change === 'block') Object.assign(raw.observation.checkpoint, { block_number: '100' });
    if (change === 'proposal') raw.observation.security.pending!.hash = fixtureHash('a');
    if (change === 'expiry') raw.observation.security.pending!.valid_until++;
    if (change === 'kind') raw.observation.security.pending!.kind = 2;
    if (change === 'readiness') Object.assign(raw, { spend_enabled: true });
    expect(() => parseBackupCommitPreview(raw, t.choice, t.parent.wire, c.commitId)).toThrow();
  });
  it('keeps an expired commit readable and rejects preparing one from an unauthorized parent', async () => {
    const t = fixture(), c = t.commit(); vi.useFakeTimers(); vi.setSystemTime(c.receipt.valid_until * 1000);
    t.fetchMock.mockResolvedValue(Response.json({ ...c.wire, state: 'expired' }));
    const read = await t.client.restoreCommit(t.choice, t.parent, c.commitId, signal());
    await expect(t.client.authorizeCommit(t.choice, t.parent, read, c.commitId, t.f.assertion(c.compiled.digest), signal())).rejects.toMatchObject({ code: 'backup/expired' });
    await expect(t.client.prepareCommit(t.choice, { wire: t.wire }, c.commitId, signal())).rejects.toMatchObject({ code: 'backup/invalid' });
    expect(t.fetchMock).toHaveBeenCalledTimes(1);
  });
  it('rejects authorization receipts that switch terms or claim economic readiness', async () => {
    const t = fixture(), owner = t.f.assertion(t.compiled.digest), factors = await t.f.proofs();
    t.fetchMock.mockResolvedValueOnce(Response.json({ ...t.authorized, expected_manifest_hash: fixtureHash('a') }));
    await expect(t.client.authorize(t.choice, { wire: t.wire }, owner, factors, signal())).rejects.toMatchObject({ code: 'backup/invalid' });
    const c = t.commit(); t.fetchMock.mockResolvedValue(Response.json({ ...c.authorized, backup_assessment: 'active' }));
    await expect(t.client.authorizeCommit(t.choice, t.parent, { wire: c.wire }, c.commitId, t.f.assertion(c.compiled.digest), signal())).rejects.toMatchObject({ code: 'backup/invalid' });
  });
});
