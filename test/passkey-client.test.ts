import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import environments from '@gatopago/environment/environments.json';
import { parseEnvironment } from '@gatopago/environment';
import { createResourceId } from '@gatopago/shared/v3/primitives';
import { clientMutationHeaders } from '@gatopago/shared/v3/client-release';
import { buildAuthConfig, type EnabledAuthConfig } from '../src/auth/config';
import { passkeyClient } from '../src/auth/passkey-client';

const environment = parseEnvironment(environments.production);
const config = buildAuthConfig(
  { ...environment, status: 'provisioned', firebase_project_id: 'v3-runtime-test' },
  {
    apiKey: `AIza${'A'.repeat(35)}`,
    appId: '1:123456789:web:012345abcdef',
    turnstileSiteKey: `0x${'A'.repeat(22)}`,
  },
) as EnabledAuthConfig;
const scope = { rpId: environment.webauthn_rp_id, origin: config.webOrigin };
const input = {
  invite: 'daniel',
  name: 'Daniel',
  username: 'daniel',
  turnstile_token: 'synthetic',
};
function login() {
  return {
    request_id: createResourceId('operation'),
    expires_at: Math.floor(Date.now() / 1000) + 300,
    scope: { ...scope },
    options: {
      challenge: Buffer.alloc(32, 1).toString('base64url'),
      rpId: scope.rpId,
      userVerification: 'required',
      timeout: 60000,
    },
  };
}
function registration() {
  return {
    ...login(),
    proof_challenge: `0x${'02'.repeat(32)}`,
    options: {
      challenge: Buffer.alloc(32, 1).toString('base64url'),
      rp: { id: scope.rpId, name: 'GatoPago' },
      user: {
        id: Buffer.alloc(32, 3).toString('base64url'),
        name: input.username,
        displayName: input.name,
      },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      timeout: 60000,
      attestation: 'none',
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      excludeCredentials: [],
    },
  };
}
const signal = () => new AbortController().signal;
beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
afterEach(() => vi.unstubAllGlobals());

describe('Passkey admission HTTP boundary', () => {
  it('uses only the pinned public route and validates the discoverable challenge', async () => {
    const wire = login();
    vi.mocked(fetch).mockResolvedValue(Response.json(wire));
    const result = await passkeyClient(config).prepareLogin(signal());
    expect(result).toMatchObject({ id: wire.request_id, challenge: `0x${'01'.repeat(32)}`, scope });
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      `${environment.api_origin}/app/v1/auth/login/options`,
      expect.objectContaining({
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        body: '{}',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...clientMutationHeaders('production'),
        },
      }),
    );
  });
  it('pins the exact profile and ES256 discoverable registration without granting a session', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json(registration()));
    expect(await passkeyClient(config).prepareRegistration(input, signal())).toMatchObject({
      userName: 'daniel',
      displayName: 'Daniel',
      proofChallenge: `0x${'02'.repeat(32)}`,
      excludeCredentials: [],
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each(['login', 'register'] as const)(
    'accepts the observed small server clock lead for %s with a five-minute client deadline',
    async (kind) => {
      const now = 1790968774333;
      const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
      try {
        const value = kind === 'login' ? login() : registration();
        value.expires_at = 1790969076;
        vi.mocked(fetch).mockResolvedValue(Response.json(value));
        const client = passkeyClient(config);
        const prepared =
          kind === 'login'
            ? await client.prepareLogin(signal())
            : await client.prepareRegistration(input, signal());
        expect(prepared.validUntilMs).toBe(now + 300_000);
        expect(fetch).toHaveBeenCalledOnce();
      } finally {
        clock.mockRestore();
      }
    },
  );
  it.each([
    { lead: 5000, accepted: true },
    { lead: 6000, accepted: false },
  ])('bounds server clock lead to five seconds ($lead ms)', async ({ lead, accepted }) => {
    const now = 1790968774000;
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      const value = login();
      value.expires_at = (now + 300_000 + lead) / 1000;
      vi.mocked(fetch).mockResolvedValue(Response.json(value));
      const request = passkeyClient(config).prepareLogin(signal());
      if (accepted) expect((await request).validUntilMs).toBe(now + 300_000);
      else await expect(request).rejects.toMatchObject({ code: 'auth/invalid-response' });
    } finally {
      clock.mockRestore();
    }
  });
  it('preserves a shorter server expiry instead of extending it to five minutes', async () => {
    const value = login();
    value.expires_at -= 20;
    vi.mocked(fetch).mockResolvedValue(Response.json(value));
    expect((await passkeyClient(config).prepareLogin(signal())).validUntilMs).toBe(
      value.expires_at * 1000,
    );
  });
  it('rejects an expiry that cannot be represented as safe integer milliseconds', async () => {
    const value = login();
    value.expires_at = Number.MAX_SAFE_INTEGER;
    vi.mocked(fetch).mockResolvedValue(Response.json(value));
    await expect(passkeyClient(config).prepareLogin(signal())).rejects.toMatchObject({
      code: 'auth/invalid-response',
    });
  });
  it.each(['123', 'daniel', 'team1', ' padded ', 'café 🐈', "O'Brien", 'x'.repeat(120)])(
    'sends the operator invitation %s unchanged',
    async (invite) => {
      vi.mocked(fetch).mockResolvedValue(Response.json(registration()));
      await passkeyClient(config).prepareRegistration({ ...input, invite }, signal());
      const call = vi.mocked(fetch).mock.calls[0];
      expect(JSON.parse(String(call[1]?.body))).toMatchObject({ invite });
    },
  );
  it.each(['rp', 'origin', 'expiry', 'future', 'uv', 'allowlist', 'challenge'])(
    'rejects changed login %s',
    async (variant) => {
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
    },
  );
  it.each(['name', 'username', 'algorithm', 'resident', 'proof'])(
    'rejects substituted registration %s',
    async (variant) => {
      const value = registration();
      if (variant === 'name') value.options.user.displayName = 'Someone else';
      if (variant === 'username') value.options.user.name = 'someone_else';
      if (variant === 'algorithm') value.options.pubKeyCredParams[0].alg = -257;
      if (variant === 'resident') value.options.authenticatorSelection.residentKey = 'preferred';
      if (variant === 'proof') value.proof_challenge = `0x${'01'.repeat(32)}`;
      vi.mocked(fetch).mockResolvedValue(Response.json(value));
      await expect(passkeyClient(config).prepareRegistration(input, signal())).rejects.toThrow();
    },
  );
  it('rejects a foreign API before sending the invitation or a request', async () => {
    await expect(
      passkeyClient({ ...config, apiOrigin: 'https://evil.test' }).prepareRegistration(
        input,
        signal(),
      ),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('surfaces username conflicts without silently retrying registration', async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ error_code: 'USERNAME_UNAVAILABLE' }, { status: 409 }),
    );
    await expect(passkeyClient(config).prepareRegistration(input, signal())).rejects.toMatchObject({
      code: 'auth/username-unavailable',
    });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each([
    ['HUMAN_VERIFY_FAILED', 'auth/human-verification-failed'],
    ['ORIGIN_NOT_ALLOWED', 'auth/service-unavailable'],
    ['CORS_NOT_ALLOWED', 'auth/service-unavailable'],
    ['CLIENT_IP_UNAVAILABLE', 'auth/service-unavailable'],
    ['UNKNOWN', 'auth/access-denied'],
  ])(
    'surfaces a 403 %s without retrying or reusing the verification token',
    async (error_code, code) => {
      vi.mocked(fetch).mockResolvedValue(Response.json({ error_code }, { status: 403 }));
      await expect(
        passkeyClient(config).prepareRegistration(input, signal()),
      ).rejects.toMatchObject({ code });
      expect(fetch).toHaveBeenCalledOnce();
    },
  );
  it('rejects oversized responses and observes cancellation before requesting', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(' '.repeat(32769)));
    const client = passkeyClient(config);
    await expect(client.prepareLogin(signal())).rejects.toThrow();
    const controller = new AbortController();
    controller.abort();
    await expect(client.prepareLogin(controller.signal)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledOnce();
  });
});
