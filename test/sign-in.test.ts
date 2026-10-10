import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientSettings } from '../src/lib/settings';

// The passkey, the Mera session and Wallet Core are simulated: what matters is what signs what.
const OWNER = '0x3333333333333333333333333333333333333333';
const ACCOUNT = '0x2222222222222222222222222222222222222222';
const fake = vi.hoisted(() => ({
  registered: true,
  signers: [] as string[],
  posted: [] as { path: string; token?: string; body?: Record<string, unknown> }[],
}));
vi.mock('../src/wallet/passkey', async (original) => ({
  ...(await original<object>()),
  findAnyWallet: async () => ({
    credentialId: 'phone',
    owner: OWNER,
    address: ACCOUNT,
    initialOwners: ['0x01'],
  }),
}));
vi.mock('../src/wallet/account', () => ({
  publicClient: () => ({}),
  gatopagoAccount: async () => ({
    address: ACCOUNT,
    signMessage: async () => (fake.signers.push('mera'), '0xmera'),
  }),
}));
vi.mock('../src/wallet/api', async (original) => ({
  ...(await original<object>()),
  api: async (
    _origin: string,
    path: string,
    init: { token?: string; body?: Record<string, unknown> } = {},
  ) => {
    fake.posted.push({ path, ...init });
    if (path === 'auth/nonce') return { nonce: 'a1b2c3d4e5f6a7b8' };
    if (path === 'auth/session') {
      if (!fake.registered && !init.body?.turnstile) {
        const { ApiError } = await import('../src/wallet/api');
        throw new ApiError(403, 'TURNSTILE_REQUIRED');
      }
      return { token: 'session', expires_at: 4102444800, user_id: 'usr' };
    }
    return {};
  },
}));

const settings = {
  apiOrigin: 'https://api.gatopago.com',
  webOrigin: 'https://gatopago.com',
  homeNetwork: 'eip155:421614',
} as ClientSettings;

beforeEach(() => {
  vi.resetModules();
  fake.registered = true;
  fake.signers = [];
  fake.posted = [];
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});

describe('signing in', () => {
  it('signs with the Mera key of the passkey, once found', async () => {
    const { enter } = await import('../src/wallet/signIn');
    const session = await enter(settings, () => Promise.reject(new Error('not asked')));
    expect(fake.signers).toEqual(['mera']);
    expect(session.wallet.owner).toBe(OWNER);
    expect(fake.posted.find(({ path }) => path === 'auth/session')?.body).toMatchObject({
      signature: '0xmera',
      initial_owners: ['0x01'],
    });
  });

  it('registers again an account Wallet Core does not know, with the same passkey', async () => {
    fake.registered = false;
    const { enter } = await import('../src/wallet/signIn');
    let asked = 0;
    const session = await enter(settings, async () => (asked++, 'human'));
    expect(asked).toBe(1);
    expect(session.wallet.address).toBe(ACCOUNT);
    expect(fake.posted.filter(({ path }) => path === 'auth/session').at(-1)?.body).toMatchObject({
      turnstile: 'human',
      initial_owners: ['0x01'],
    });
  });
});
