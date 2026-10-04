import { afterEach, describe, expect, it, vi } from 'vitest';
import environments from '@gatopago/environment/environments.json';
import { parseEnvironment } from '@gatopago/environment';
import { createResourceId } from '@gatopago/shared/v3/primitives';
import { CLIENT_STATUS_HEADER } from '@gatopago/shared/v3/client-release';
import { loadWalletPage, WalletCoreError } from '../src/wallet/core';
import { buildAuthConfig, type EnabledAuthConfig } from '../src/auth/config';

const config = buildAuthConfig(
  parseEnvironment({
    ...environments.production,
    status: 'provisioned',
    firebase_project_id: 'v3-runtime-test',
  }),
  {
    apiKey: `AIza${'a'.repeat(35)}`,
    appId: '1:123:web:abcdef',
    turnstileSiteKey: `0x${'a'.repeat(22)}`,
  },
) as EnabledAuthConfig;
const token = async () => 'synthetic.id.token';
const signal = () => new AbortController().signal;
const owner = createResourceId('user');
const wallet = () => ({ id: createResourceId('wallet'), user_id: owner, status: 'active' });
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Wallet Core browser transport (synthetic HTTP, no real identity/funds)', () => {
  it('performs one no-store authenticated read with no implicit extra activity', async () => {
    const data = { data: [wallet()], next_cursor: null };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(data));
    vi.stubGlobal('fetch', fetchMock);
    expect(await loadWalletPage(config, token, signal())).toEqual(data);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `${environments.production.api_origin}/app/v1/wallets?limit=20`,
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        headers: { Authorization: 'Bearer synthetic.id.token', Accept: 'application/json' },
      }),
    );
  });
  it('does not create a user implicitly when admission is missing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ error_code: 'SESSION_REQUIRED' }, { status: 409 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(loadWalletPage(config, token, signal())).rejects.toMatchObject({
      code: 'wallet/unavailable',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].method).toBe('GET');
  });
  it('never sends emulator tokens or tokens to a foreign/changed API origin', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const getToken = vi.fn(token);
    for (const changed of [
      { ...config, mode: 'emulator' as const },
      { ...config, apiOrigin: 'https://evil.test' },
      { ...config, apiOrigin: 'not a URL' },
      { ...config, apiOrigin: `${config.apiOrigin}?redirect=evil` },
    ]) {
      await expect(loadWalletPage(changed, getToken, signal())).rejects.toMatchObject({
        code: 'wallet/unavailable',
      });
    }
    expect(getToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('requires sign-in again on 401 and an explicit refresh on incompatible clients', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({}, { status: 401 }))
      .mockResolvedValueOnce(
        Response.json({}, { status: 409, headers: { [CLIENT_STATUS_HEADER]: 'update-required' } }),
      );
    vi.stubGlobal('fetch', fetchMock);
    await expect(loadWalletPage(config, token, signal())).rejects.toMatchObject({
      code: 'auth/unauthenticated',
    });
    await expect(loadWalletPage(config, token, signal())).rejects.toMatchObject({
      code: 'client/update-required',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('rejects corrupt, cross-owner, duplicate, unordered, or address-injected wallet responses', async () => {
    const first = wallet(),
      second = wallet();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    for (const data of [
      null,
      { data: [], next_cursor: first.id },
      { data: [{ ...first, id: 'firebase-uid' }], next_cursor: null },
      { data: [first, first], next_cursor: null },
      { data: [first, { ...second, user_id: createResourceId('user') }], next_cursor: null },
      { data: [{ ...first, balance: '100' }], next_cursor: null },
      { data: [first, second].sort((a, b) => b.id.localeCompare(a.id)), next_cursor: null },
    ]) {
      fetchMock.mockResolvedValueOnce(Response.json(data));
      await expect(loadWalletPage(config, token, signal())).rejects.toMatchObject({
        code: 'wallet/unavailable',
      });
    }
  });
  it('paginates only with a validated cursor and never bootstraps while loading more', async () => {
    const ids = [wallet(), wallet()].sort((a, b) => a.id.localeCompare(b.id));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ data: [ids[1]], next_cursor: null }))
      .mockResolvedValueOnce(Response.json({ error_code: 'SESSION_REQUIRED' }, { status: 409 }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await loadWalletPage(config, token, signal(), ids[0].id)).data).toEqual([ids[1]]);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${environments.production.api_origin}/app/v1/wallets?limit=20&after=${ids[0].id}`,
    );
    await expect(loadWalletPage(config, token, signal(), ids[0].id)).rejects.toMatchObject({
      code: 'wallet/unavailable',
    });
    await expect(loadWalletPage(config, token, signal(), 'bad-cursor')).rejects.toMatchObject({
      code: 'wallet/unavailable',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('cancels an oversized response and exposes no raw response body', async () => {
    let cancelled = false;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array(32_769));
            },
            cancel() {
              cancelled = true;
            },
          }),
        ),
      ),
    );
    await expect(loadWalletPage(config, token, signal())).rejects.toMatchObject({
      message: 'wallet/unavailable',
    });
    expect(cancelled).toBe(true);
  });
  it('aborts an unresolved token request and never sends a token after cancellation', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    let resolve!: (token: string) => void;
    const getToken = () =>
      new Promise<string>((done) => {
        resolve = done;
      });
    const controller = new AbortController();
    const operation = loadWalletPage(config, getToken, controller.signal);
    controller.abort(new Error('identity changed'));
    await expect(operation).rejects.toThrow('identity changed');
    resolve('old-user-token');
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('cancels a body stream that never ends', async () => {
    let cancelled = false;
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream<Uint8Array>({
            cancel() {
              cancelled = true;
            },
          }),
        ),
      ),
    );
    const operation = loadWalletPage(config, token, controller.signal);

    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort(new Error('unmounted'));
    await expect(operation).rejects.toThrow('unmounted');
    expect(cancelled).toBe(true);
  });
  it('preserves session-change errors without converting them into empty wallets', async () => {
    await expect(
      loadWalletPage(
        config,
        async () => {
          throw new WalletCoreError('auth/session-changed');
        },
        signal(),
      ),
    ).rejects.toMatchObject({ code: 'auth/session-changed' });
  });
});
