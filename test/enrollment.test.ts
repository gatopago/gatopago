import { afterEach, describe, expect, it, vi } from 'vitest';
import environments from '@gatopago/environment/environments.json';
import { parseEnvironment } from '@gatopago/environment';
import { createResourceId } from '@gatopago/shared/v3/primitives';
import { clientMutationHeaders, CLIENT_STATUS_HEADER } from '@gatopago/shared/v3/client-release';
import { buildAuthConfig, type EnabledAuthConfig } from '../src/auth/config';
import { prepareEnrollment, completeEnrollment, type EnrollmentSubmission } from '../src/wallet/enrollment';

const config = buildAuthConfig(parseEnvironment({ ...environments.production, status: 'provisioned', firebase_project_id: 'v3-runtime-test' }), {
  apiKey: `AIza${'a'.repeat(35)}`, appId: '1:123:web:abcdef', turnstileSiteKey: `0x${'a'.repeat(22)}`,
}) as EnabledAuthConfig;
const token = async () => 'synthetic.token.signature';
const signal = () => new AbortController().signal;
const id = createResourceId('operation');
const b64 = (byte: number) => Buffer.alloc(32, byte).toString('base64url');
const receipt = () => ({ enrollment_id: id, state: 'enrolled', onchain_authority: false });
const preparation = () => ({ enrollment_id: id, state: 'prepared', expires_at: Math.floor(Date.now() / 1000) + 300,
  scope: { rpId: environments.production.webauthn_rp_id, origin: config.webOrigin }, proof_challenge: `0x${'02'.repeat(32)}`,
  options: { challenge: b64(1), rp: { id: environments.production.webauthn_rp_id, name: 'GatoPago' },
    user: { id: b64(3), name: 'GatoPago 12345678', displayName: 'Tu cuenta GatoPago' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }], timeout: 60000, attestation: 'none',
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' }, excludeCredentials: [{ type: 'public-key', id: b64(4) }] },
  onchain_authority: false });
// Transport fixture only. Real cryptographic enrollment is covered by the Worker runtime tests.
const submission: EnrollmentSubmission = { credential_id: b64(4), client_data: 'e30', attestation: 'oA', transports: ['internal'],
  proof: { authenticator_data: 'AA', client_data: 'e30', signature: 'MA' } };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Enrollment HTTP contract (synthetic server)', () => {
  it('prepares only the requested identity operation with release headers and no browser ceremony', async () => {
    const request = vi.fn().mockResolvedValue(Response.json(preparation())); vi.stubGlobal('fetch', request);
    const result = await prepareEnrollment(config, token, id, signal());
    expect(result).toMatchObject({ kind: 'prepared', id, challenge: `0x${'01'.repeat(32)}`, proofChallenge: `0x${'02'.repeat(32)}` });
    expect(Object.isFrozen(result)).toBe(true);
    expect(request).toHaveBeenCalledExactlyOnceWith(`${environments.production.api_origin}/app/v1/security/enrollments`, expect.objectContaining({
      method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error', body: JSON.stringify({ request_id: id }),
      headers: { Authorization: 'Bearer synthetic.token.signature', Accept: 'application/json', 'Content-Type': 'application/json', ...clientMutationHeaders('production') },
    }));
  });
  it('requires an admitted user and never creates one during enrollment', async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ error_code: 'SESSION_REQUIRED' }, { status: 409 }));
    vi.stubGlobal('fetch', request);
    await expect(prepareEnrollment(config, token, id, signal())).rejects.toMatchObject({ code: 'enrollment/unavailable' });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe(`${environments.production.api_origin}/app/v1/security/enrollments`);
  });
  it('does not retry an uncertain preparation', async () => {
    const request = vi.fn().mockRejectedValue(new Error('network')); vi.stubGlobal('fetch', request);
    await expect(prepareEnrollment(config, token, id, signal())).rejects.toMatchObject({ code: 'enrollment/unavailable' });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each(['scope', 'authority', 'id', 'algorithm', 'verification', 'challenge', 'duplicate', 'future', 'extra'])('rejects a changed %s before it can reach WebAuthn', async (change) => {
    const data = preparation();
    if (change === 'scope') data.scope.rpId = 'other.gatopago.com';
    if (change === 'authority') data.onchain_authority = true;
    if (change === 'id') data.enrollment_id = createResourceId('operation');
    if (change === 'algorithm') data.options.pubKeyCredParams[0].alg = -257;
    if (change === 'verification') data.options.authenticatorSelection.userVerification = 'preferred';
    if (change === 'challenge') data.options.challenge = b64(2);
    if (change === 'duplicate') data.options.excludeCredentials.push(data.options.excludeCredentials[0]);
    if (change === 'future') data.expires_at += 60;
    if (change === 'extra') Object.assign(data.options, { extensions: { prf: {} } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(data)));
    await expect(prepareEnrollment(config, token, id, signal())).rejects.toMatchObject({ code: 'enrollment/invalid' });
  });
  it('rejects expired preparation but recognizes an idempotently completed attempt', async () => {
    const data = preparation(); data.expires_at -= 301;
    const request = vi.fn().mockResolvedValueOnce(Response.json(data)).mockResolvedValueOnce(Response.json(receipt())); vi.stubGlobal('fetch', request);
    await expect(prepareEnrollment(config, token, id, signal())).rejects.toMatchObject({ code: 'enrollment/expired' });
    expect(await prepareEnrollment(config, token, id, signal())).toEqual({ kind: 'enrolled', id });
  });
  it('sends the exact proof once and requires an explicit non-monetary receipt for this attempt', async () => {
    const request = vi.fn().mockResolvedValueOnce(Response.json(receipt())).mockResolvedValueOnce(Response.json({ ...receipt(), onchain_authority: true })); vi.stubGlobal('fetch', request);
    expect(await completeEnrollment(config, token, id, submission, signal())).toEqual({ kind: 'enrolled', id });
    expect(request.mock.calls[0][1].body).toBe(JSON.stringify(submission));
    await expect(completeEnrollment(config, token, id, submission, signal())).rejects.toMatchObject({ code: 'enrollment/invalid' });
  });
  it.each([[410, 'ENROLLMENT_EXPIRED', 'enrollment/expired'], [409, 'ENROLLMENT_CONFLICT', 'enrollment/conflict'], [429, 'ENROLLMENT_LIMIT', 'enrollment/limit']])('keeps definitive %i distinct from uncertain transport failure', async (status, code, expected) => {
    const request = vi.fn().mockResolvedValue(Response.json({ error_code: code }, { status: status as number })); vi.stubGlobal('fetch', request);
    await expect(completeEnrollment(config, token, id, submission, signal())).rejects.toMatchObject({ code: expected });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('preserves unauthenticated and retired-client results without bootstrapping', async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response('', { status: 409, headers: { [CLIENT_STATUS_HEADER]: 'update-required' } })); vi.stubGlobal('fetch', request);
    await expect(prepareEnrollment(config, token, id, signal())).rejects.toMatchObject({ code: 'auth/unauthenticated' });
    await expect(prepareEnrollment(config, token, id, signal())).rejects.toMatchObject({ code: 'client/update-required' });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('rejects external API URLs, emulator mode and invalid IDs before obtaining a token', async () => {
    const getToken = vi.fn(token); vi.stubGlobal('fetch', vi.fn());
    for (const candidate of [{ ...config, apiOrigin: 'https://evil.test' }, { ...config, mode: 'emulator' as const }]) {
      await expect(prepareEnrollment(candidate, getToken, id, signal())).rejects.toThrow();
    }
    await expect(prepareEnrollment(config, getToken, '../other', signal())).rejects.toThrow();
    expect(getToken).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it('bounds a stalled fetch even if the adapter ignores AbortSignal', async () => {
    vi.useFakeTimers(); vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));
    const timeout = new AbortController(); vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
    const operation = prepareEnrollment(config, token, id, signal());
    const check = expect(operation).rejects.toThrow();
    await Promise.resolve(); timeout.abort(new DOMException('Timeout', 'TimeoutError')); await check;
  });
  it('does not wait forever for a malicious response stream to cancel', async () => {
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(32769)); }, cancel() { return new Promise<void>(() => undefined); } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream)));
    await expect(prepareEnrollment(config, token, id, signal())).rejects.toThrow();
  });
});
