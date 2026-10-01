import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import environments from '@gatopago/environment/environments.json';
import { parseEnvironment } from '@gatopago/environment';
import { createResourceId } from '@gatopago/shared/v3/primitives';
import { clientMutationHeaders } from '@gatopago/shared/v3/client-release';
import { buildAuthConfig, type EnabledAuthConfig } from '../src/auth/config';
import { passkeyClient } from '../src/auth/passkey-client';

const environment = parseEnvironment(environments.staging);
const config = buildAuthConfig({ ...environment, status: 'provisioned', firebase_project_id: 'gatopago-staging-test' }, {
  apiKey: `AIza${'A'.repeat(35)}`, appId: '1:123456789:web:012345abcdef', turnstileSiteKey: `0x${'A'.repeat(22)}`,
}) as EnabledAuthConfig;
const scope = { rpId: environment.webauthn_rp_id, origin: config.webOrigin };
const input = { invite: 'I'.repeat(43), name: 'Daniel', username: 'daniel', turnstile_token: 'synthetic' };
function login() { return { request_id: createResourceId('operation'), expires_at: Math.floor(Date.now() / 1000) + 300,
  scope: { ...scope }, options: { challenge: Buffer.alloc(32, 1).toString('base64url'), rpId: scope.rpId, userVerification: 'required', timeout: 60000 } }; }
function registration() { return { ...login(), proof_challenge: `0x${'02'.repeat(32)}`, options: {
  challenge: Buffer.alloc(32, 1).toString('base64url'), rp: { id: scope.rpId, name: 'GatoPago' },
  user: { id: Buffer.alloc(32, 3).toString('base64url'), name: input.username, displayName: input.name },
  pubKeyCredParams: [{ type: 'public-key', alg: -7 }], timeout: 60000, attestation: 'none',
  authenticatorSelection: { residentKey: 'required', userVerification: 'required' }, excludeCredentials: [],
} }; }
const signal = () => new AbortController().signal;
beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
afterEach(() => vi.unstubAllGlobals());

describe('Passkey admission HTTP boundary', () => {
  it('uses only the pinned public route and validates the discoverable challenge', async () => {
    const wire = login(); vi.mocked(fetch).mockResolvedValue(Response.json(wire));
    const result = await passkeyClient(config).prepareLogin(signal());
    expect(result).toMatchObject({ id: wire.request_id, challenge: `0x${'01'.repeat(32)}`, scope });
    expect(fetch).toHaveBeenCalledExactlyOnceWith(`${environment.api_origin}/app/v1/auth/login/options`, expect.objectContaining({
      credentials: 'omit', redirect: 'error', cache: 'no-store', body: '{}',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...clientMutationHeaders('staging') },
    }));
  });
  it('pins the exact profile and ES256 discoverable registration without granting a session', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json(registration()));
    expect(await passkeyClient(config).prepareRegistration(input, signal())).toMatchObject({ userName: 'daniel', displayName: 'Daniel',
      proofChallenge: `0x${'02'.repeat(32)}`, excludeCredentials: [] });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each(['rp', 'origin', 'expiry', 'future', 'uv', 'allowlist', 'challenge'])('rejects changed login %s', async variant => {
    const value = login();
    if (variant === 'rp') value.scope.rpId = 'evil.test';
    if (variant === 'origin') value.scope.origin = 'https://evil.test';
    if (variant === 'expiry') value.expires_at -= 301;
    if (variant === 'future') value.expires_at += 600;
    if (variant === 'uv') value.options.userVerification = 'preferred';
    if (variant === 'allowlist') Object.assign(value.options, { allowCredentials: [] });
    if (variant === 'challenge') value.options.challenge = 'short';
    vi.mocked(fetch).mockResolvedValue(Response.json(value));
    await expect(passkeyClient(config).prepareLogin(signal())).rejects.toThrow();
  });
  it.each(['name', 'username', 'algorithm', 'resident', 'proof'])('rejects substituted registration %s', async variant => {
    const value = registration();
    if (variant === 'name') value.options.user.displayName = 'Someone else';
    if (variant === 'username') value.options.user.name = 'someone_else';
    if (variant === 'algorithm') value.options.pubKeyCredParams[0].alg = -257;
    if (variant === 'resident') value.options.authenticatorSelection.residentKey = 'preferred';
    if (variant === 'proof') value.proof_challenge = `0x${'01'.repeat(32)}`;
    vi.mocked(fetch).mockResolvedValue(Response.json(value));
    await expect(passkeyClient(config).prepareRegistration(input, signal())).rejects.toThrow();
  });
  it('rejects a foreign API before sending the invitation or a request', async () => {
    await expect(passkeyClient({ ...config, apiOrigin: 'https://evil.test' }).prepareRegistration(input, signal())).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('surfaces username conflicts without silently retrying registration', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ error_code: 'USERNAME_UNAVAILABLE' }, { status: 409 }));
    await expect(passkeyClient(config).prepareRegistration(input, signal())).rejects.toMatchObject({ code: 'auth/username-unavailable' });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('rejects oversized responses and observes cancellation before requesting', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(' '.repeat(32769)));
    const client = passkeyClient(config);
    await expect(client.prepareLogin(signal())).rejects.toThrow();
    const controller = new AbortController(); controller.abort();
    await expect(client.prepareLogin(controller.signal)).rejects.toThrow(); expect(fetch).toHaveBeenCalledOnce();
  });
});
