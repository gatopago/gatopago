import { afterEach, describe, expect, it, vi } from 'vitest';
import environments from '@gatopago/environment/environments.json';
import { parseEnvironment } from '@gatopago/environment';
import { createResourceId } from '@gatopago/shared/v3/primitives';
import { parseCredentialInventory } from '@gatopago/shared/v3/credential-inventory';
import { buildAuthConfig, type EnabledAuthConfig } from '../src/auth/config';
import { loadCredentialInventory } from '../src/wallet/credentials';
import { CredentialInventoryStore } from '../src/wallet/credential-inventory-store';

const config = buildAuthConfig(parseEnvironment({ ...environments.staging, status: 'provisioned', firebase_project_id: 'v3-runtime-test' }), {
  apiKey: `AIza${'a'.repeat(35)}`, appId: '1:123:web:abcdef', turnstileSiteKey: `0x${'a'.repeat(22)}`,
}) as EnabledAuthConfig;
const scope = { rpId: environments.staging.webauthn_rp_id, origin: config.webOrigin };
const key = () => ({ credential_ref: createResourceId('operation'), created_at: Math.floor(Date.now() / 1000) - 1,
  transports: ['internal'], aaguid: '00000000-0000-0000-0000-000000000000', backup_eligible: true, backed_up_at_registration: true });
const inventory = () => ({ scope, data: [key()], device_availability: 'unknown', onchain_authority: 'not_assessed' });
const token = async () => 'synthetic.token.signature';
const signal = () => new AbortController().signal;
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Read-only credential inventory contract', () => {
  it('makes a single no-store GET without mutation headers, bootstrap or credential ceremonies', async () => {
    const value = inventory(), fetchMock = vi.fn().mockResolvedValue(Response.json(value)); vi.stubGlobal('fetch', fetchMock);
    expect(await loadCredentialInventory(config, token, signal())).toEqual(value);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`${environments.staging.api_origin}/app/v1/security/credentials`, expect.objectContaining({
      method: 'GET', cache: 'no-store', credentials: 'omit', redirect: 'error',
      headers: { Authorization: 'Bearer synthetic.token.signature', Accept: 'application/json' },
    }));
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('body');
  });
  it('detaches and freezes the metadata without inventing current device/authority evidence', () => {
    const original = inventory(), parsed = parseCredentialInventory(original, scope);
    original.data[0].transports.push('usb'); original.data.length = 0;
    expect(parsed.data).toHaveLength(1); expect(parsed.data[0].transports).toEqual(['internal']);
    expect(Object.isFrozen(parsed.data[0])).toBe(true);
    expect(parsed).toMatchObject({ device_availability: 'unknown', onchain_authority: 'not_assessed' });
  });
  it.each(['authority', 'availability', 'scope', 'duplicate', 'limit', 'reference', 'time', 'flags', 'transport', 'aaguid', 'extra', 'key-material'])('rejects invalid %s instead of accepting an empty/successful inventory', async (change) => {
    const value = inventory();
    if (change === 'authority') value.onchain_authority = 'active';
    if (change === 'availability') value.device_availability = 'available';
    if (change === 'scope') value.scope = { ...scope, rpId: 'gatopago.com' };
    if (change === 'duplicate') value.data.push(value.data[0]);
    if (change === 'limit') value.data = Array.from({ length: 17 }, key);
    if (change === 'reference') Object.assign(value.data[0], { credential_ref: '../another-user' });
    if (change === 'time') value.data[0].created_at = Number.MAX_SAFE_INTEGER;
    if (change === 'flags') value.data[0].backup_eligible = false;
    if (change === 'transport') value.data[0].transports.push('internal');
    if (change === 'aaguid') value.data[0].aaguid = 'verified-google';
    if (change === 'extra') Object.assign(value, { next: 'https://other.test' });
    if (change === 'key-material') Object.assign(value.data[0], { credential_id: 'must-not-be-listed' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(value)));
    await expect(loadCredentialInventory(config, token, signal())).rejects.toMatchObject({ code: 'credentials/unavailable' });
  });
  it.each([[409, 'SESSION_REQUIRED', 'credentials/profile-required'], [503, 'WALLET_DATA_INVALID', 'credentials/unavailable'],
    [401, 'UNAUTHENTICATED', 'auth/unauthenticated']] as const)('keeps %s distinct without retrying or creating a profile', async (status, error_code, code) => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ error_code }, { status })); vi.stubGlobal('fetch', fetchMock);
    await expect(loadCredentialInventory(config, token, signal())).rejects.toMatchObject({ code });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('does not fetch a foreign API or an emulator-backed fake inventory', async () => {
    const getToken = vi.fn(token); vi.stubGlobal('fetch', vi.fn());
    for (const candidate of [{ ...config, apiOrigin: 'https://other.test' }, { ...config, mode: 'emulator' as const }]) {
      await expect(loadCredentialInventory(candidate, getToken, signal())).rejects.toThrow();
    }
    expect(getToken).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it('does not treat a slow device clock as evidence that a registered key is invalid', async () => {
    const value = inventory(); vi.spyOn(Date, 'now').mockReturnValue((value.data[0].created_at - 86400) * 1000);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(value)));
    expect(await loadCredentialInventory(config, token, signal())).toEqual(value);
    expect(() => parseCredentialInventory(value, scope, value.data[0].created_at - 1)).toThrow('Invalid credential inventory');
  });
  it('aborts stalled token acquisition without sending a later token', async () => {
    let resolve!: (value: string) => void; const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn());
    const pending = loadCredentialInventory(config, () => new Promise<string>((done) => { resolve = done; }), controller.signal);
    controller.abort(); await expect(pending).rejects.toThrow(); resolve('late.token.signature');
    await Promise.resolve(); expect(fetch).not.toHaveBeenCalled();
  });
  it('bounds a stalled fetch even when the fetch implementation ignores its signal', async () => {
    const timeout = new AbortController(); vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));
    const pending = loadCredentialInventory(config, token, signal());
    const checked = expect(pending).rejects.toThrow();
    await Promise.resolve(); timeout.abort(); await checked;
  });
  it('rejects oversized response bodies', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(' '.repeat(32769))));
    await expect(loadCredentialInventory(config, token, signal())).rejects.toThrow();
  });
});

describe('Component-owned inventory state', () => {
  function setup() {
    const assertCurrent = vi.fn();
    const read = vi.fn(async (signal: AbortSignal) => { signal.throwIfAborted(); return parseCredentialInventory(inventory(), scope); });
    const capture = vi.fn(() => ({ assertCurrent, read }));
    return { store: new CredentialInventoryStore(capture), capture, assertCurrent, read };
  }
  it('does nothing on construction/render and reads once when requested, without polling', async () => {
    const { store, capture, read } = setup();
    expect(store.snapshot()).toEqual({ phase: 'loading' }); expect(capture).not.toHaveBeenCalled();
    await store.load(); expect(store.snapshot().phase).toBe('ready');
    store.snapshot(); store.checkSession(); await Promise.resolve();
    expect(read).toHaveBeenCalledOnce();
  });
  it('replaces an outstanding pre-registration read and ignores its later stale result', async () => {
    const { store, read } = setup();
    let resolve!: (value: ReturnType<typeof parseCredentialInventory>) => void;
    read.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const old = store.load(); await store.load(); const current = store.snapshot();
    expect(read.mock.calls[0][0].aborted).toBe(true);
    resolve(parseCredentialInventory({ ...inventory(), data: [] }, scope)); await old;
    expect(store.snapshot()).toBe(current);
  });
  it('clears old metadata and aborts in-flight reads on session change, with no auto-restart', async () => {
    const { store, read } = setup(); await store.load();
    let resolve!: (value: ReturnType<typeof parseCredentialInventory>) => void;
    read.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const pending = store.load(); store.invalidate();
    expect(read.mock.calls[1][0].aborted).toBe(true);
    resolve(parseCredentialInventory(inventory(), scope)); await pending; await store.load();
    expect(store.snapshot()).toEqual({ phase: 'closed', code: 'auth/session-changed' }); expect(read).toHaveBeenCalledTimes(2);
  });
  it('discards metadata when the captured same-UID session is replaced', async () => {
    const { store, assertCurrent } = setup(); await store.load();
    assertCurrent.mockImplementation(() => { throw new Error('session replaced'); }); store.checkSession();
    expect(store.snapshot()).toEqual({ phase: 'closed', code: 'auth/session-changed' });
  });
  it('does not turn a failed refresh into an empty inventory or retain the prior count', async () => {
    const { store, read } = setup(); await store.load();
    read.mockRejectedValueOnce(new Error('unavailable')); await store.load();
    expect(store.snapshot()).toEqual({ phase: 'error', code: 'credentials/unavailable' });
    await store.load(); expect(store.snapshot().phase).toBe('ready');
  });
  it('can unmount/remount under StrictMode without preserving private metadata', async () => {
    const { store, read } = setup(); await store.load(); store.cancel();
    expect(store.snapshot()).toEqual({ phase: 'loading' }); await store.load(); expect(read).toHaveBeenCalledTimes(2);
  });
  it('does not notify unsubscribed listeners', async () => {
    const { store } = setup(); const listener = vi.fn(), unsubscribe = store.subscribe(listener);
    await store.load(); expect(listener).toHaveBeenCalledTimes(2); unsubscribe(); store.cancel();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
