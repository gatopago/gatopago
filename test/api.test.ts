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
