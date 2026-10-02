import { afterEach, describe, expect, it, vi } from 'vitest';
import environments from '@gatopago/environment/environments.json';
import { parseEnvironment } from '@gatopago/environment';
import { parseCredentialDetail } from '@gatopago/shared/v3/credential-detail';
import { createResourceId } from '@gatopago/shared/v3/primitives';
import { buildAuthConfig, type EnabledAuthConfig } from '../src/auth/config';
import { loadCredentialDetail } from '../src/wallet/credential-detail';
import { initializationFixture } from '@gatopago/test-fixtures/v3-initialization';

const config = buildAuthConfig(parseEnvironment({ ...environments.production, status: 'provisioned', firebase_project_id: 'v3-runtime-test' }), {
  apiKey: `AIza${'a'.repeat(35)}`, appId: '1:123:web:abcdef', turnstileSiteKey: `0x${'a'.repeat(22)}`,
}) as EnabledAuthConfig;
const token = async () => 'synthetic.token.signature';
const signal = () => new AbortController().signal;
function fixture() {
  const f = initializationFixture(), p = { credential_ref: createResourceId('operation'), credential_id: 'c3ludGhldGlj', public_key: f.input.publicKey };
  return { scope: { ...f.input.scope }, credential_ref: p.credential_ref,
    credential_id: p.credential_id, public_key: p.public_key, device_availability: 'unknown', onchain_authority: 'not_assessed' };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Owner credential detail transport and parser', () => {
  it('loads one selected credential via no-store GET, without ceremonies, writes or mutation headers', async () => {
    const value = fixture(), fetchMock = vi.fn().mockResolvedValue(Response.json(value)); vi.stubGlobal('fetch', fetchMock);
    const result = await loadCredentialDetail(config, token, value.credential_ref, signal());
    expect(result).toEqual(value); expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.scope)).toBe(true);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`${environments.production.api_origin}/app/v1/security/credentials/${value.credential_ref}`,
      expect.objectContaining({ method: 'GET', cache: 'no-store', credentials: 'omit', redirect: 'error',
        headers: { Authorization: 'Bearer synthetic.token.signature', Accept: 'application/json' } }));
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('body');
  });
  it('validates the reference before acquiring a token or requesting a path', async () => {
    const getToken = vi.fn(token); vi.stubGlobal('fetch', vi.fn());
    for (const id of ['../user-b', 'not-an-operation', `${createResourceId('operation')}?uid=another`, createResourceId('wallet')]) {
      await expect(loadCredentialDetail(config, getToken, id, signal())).rejects.toMatchObject({ code: 'credentials/unavailable' });
    }
    expect(getToken).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['reference', 'origin', 'rp', 'key-scope', 'key-curve', 'availability', 'authority', 'extra', 'credential-shape', 'credential-padding', 'credential-bits', 'credential-size'])(
  'rejects a substituted or invalid %s', async (change) => {
    const value = fixture(), expected = { ...value.scope }, id = value.credential_ref;
    if (change === 'reference') value.credential_ref = createResourceId('operation');
    if (change === 'origin') value.scope.origin = 'https://other.test';
    if (change === 'rp') value.scope.rpId = 'other.test';
    if (change === 'key-scope') value.public_key = `0x${'00'.repeat(64)}${value.public_key.slice(130)}`;
    if (change === 'key-curve') Object.assign(value, { public_key: `${value.public_key.slice(0, 130)}${'00'.repeat(64)}` });
    if (change === 'availability') value.device_availability = 'available';
    if (change === 'authority') value.onchain_authority = 'active';
    if (change === 'extra') Object.assign(value, { proof: 'must-not-be-exported' });
    if (change === 'credential-shape') value.credential_id = '';
    if (change === 'credential-padding') value.credential_id = 'Zg==';
    if (change === 'credential-bits') value.credential_id = 'Zh';
    if (change === 'credential-size') value.credential_id = Buffer.alloc(1025).toString('base64url');
    expect(() => parseCredentialDetail(value, expected, id)).toThrow();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(value)));
    await expect(loadCredentialDetail(config, token, id, signal())).rejects.toMatchObject({ code: 'credentials/unavailable' });
  });
  it.each([1, 1024])('accepts a canonical %s-byte authenticator identifier and detaches the result', (length) => {
    const value = fixture(); value.credential_id = Buffer.alloc(length).toString('base64url');
    const result = parseCredentialDetail(value, value.scope, value.credential_ref); value.scope.origin = 'https://changed.test';
    expect(result.scope.origin).toBe(environments.production.web_origin);
  });
  it.each([[404, 'NOT_FOUND', 'credentials/not-found'], [409, 'SESSION_REQUIRED', 'credentials/profile-required'],
    [401, 'UNAUTHENTICATED', 'auth/unauthenticated'], [503, 'WALLET_DATA_INVALID', 'credentials/unavailable']] as const)(
  'preserves %s without retrying or starting registration', async (status, error_code, code) => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ error_code }, { status })); vi.stubGlobal('fetch', fetchMock);
    await expect(loadCredentialDetail(config, token, createResourceId('operation'), signal())).rejects.toMatchObject({ code });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('does not acquire a token for another API or a local emulator', async () => {
    const getToken = vi.fn(token); vi.stubGlobal('fetch', vi.fn());
    for (const candidate of [{ ...config, apiOrigin: 'https://other.test' }, { ...config, mode: 'emulator' as const }]) {
      await expect(loadCredentialDetail(candidate, getToken, createResourceId('operation'), signal())).rejects.toThrow();
    }
    expect(getToken).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it('bounds the response and cancels a stalled token without sending it later', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(' '.repeat(32769))));
    await expect(loadCredentialDetail(config, token, createResourceId('operation'), signal())).rejects.toThrow();
    let resolve!: (token: string) => void; const controller = new AbortController(), fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const pending = loadCredentialDetail(config, () => new Promise<string>((done) => { resolve = done; }), createResourceId('operation'), controller.signal);
    controller.abort(); await expect(pending).rejects.toThrow(); resolve('late.token.signature');
    await Promise.resolve(); expect(fetchMock).not.toHaveBeenCalled();
  });
});
