import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../src/wallet/session';

const session = (token: string) =>
  ({
    token,
    expiresAt: 4102444800,
    userId: 'usr_test',
    wallet: {
      address: '0x2222222222222222222222222222222222222222',
      credentialId: 'phone',
      owner: '0x3333333333333333333333333333333333333333',
      initialOwners: [],
    },
  }) as unknown as Session;

beforeEach(() => {
  vi.resetModules();
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal('fetch', async () =>
    Response.json({ error_code: 'UNAUTHENTICATED' }, { status: 401 }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('a rejected session', () => {
  it('signs out only when it is the one in use', async () => {
    const { api } = await import('../src/wallet/api');
    const { currentSession, saveSession } = await import('../src/wallet/session');
    saveSession(session('new'));
    // A late answer to the session this device used before (another account, or replaced).
    await expect(api('https://api.gatopago.com', 'profile', { token: 'old' })).rejects.toThrow(
      'UNAUTHENTICATED',
    );
    expect(currentSession()?.token).toBe('new');
    await expect(api('https://api.gatopago.com', 'profile', { token: 'new' })).rejects.toThrow(
      'UNAUTHENTICATED',
    );
    expect(currentSession()).toBeNull();
  });
});

describe('an answer that is not a JSON object', () => {
  it('is a failure of its own, never an empty success', async () => {
    const { api } = await import('../src/wallet/api');
    for (const answer of [
      () => new Response('<html>Bad gateway</html>', { status: 200 }),
      () => new Response('', { status: 200 }),
      () => Response.json(null),
      () => Response.json([]),
    ]) {
      vi.stubGlobal('fetch', async () => answer());
      await expect(api('https://api.gatopago.com', 'groups', { token: 't' })).rejects.toThrow(
        'INVALID_RESPONSE',
      );
    }
    vi.stubGlobal('fetch', async () => Response.json({ groups: [] }));
    expect(await api('https://api.gatopago.com', 'groups', { token: 't' })).toEqual({ groups: [] });
  });

  it('keeps the unavailable code for an error without a body', async () => {
    const { api } = await import('../src/wallet/api');
    vi.stubGlobal('fetch', async () => new Response('Bad gateway', { status: 502 }));
    await expect(api('https://api.gatopago.com', 'groups', { token: 't' })).rejects.toThrow(
      'UNAVAILABLE',
    );
  });
});
