import { beforeEach, describe, expect, it, vi } from 'vitest';
import { privateKeyToAddress } from 'viem/accounts';
import { meraEvmKey, meraSeed } from '@gatopago/shared/passkey';
import type { ClientSettings } from '../src/lib/settings';
import type { Session } from '../src/wallet/session';

// The passkey is simulated: one prompt that answers when the test says so.
const prompt = vi.hoisted(() => ({ calls: [] as unknown[], answer: () => {} }));
/** Holds the Stellar key's derivation until the test lets it finish. */
const derivation = vi.hoisted(() => ({ hold: null as Promise<void> | null }));
vi.mock('@gatopago/shared/passkey', async (original) => {
  const passkey = await original<typeof import('@gatopago/shared/passkey')>();
  return {
    ...passkey,
    stellarKeyFromSeed: async (seed: Uint8Array) => {
      const key = await passkey.stellarKeyFromSeed(seed);
      await derivation.hold;
      return key;
    },
  };
});
vi.mock('@category-labs/mera', async (original) => ({
  ...(await original<object>()),
  getPasskeyPrfOutput: (options: unknown) => {
    prompt.calls.push(options);
    return new Promise((resolve) => {
      prompt.answer = () =>
        resolve({ credentialId: 'phone', prfOutput: new Uint8Array(32).fill(7) });
    });
  },
}));

const settings = {
  passkeyRpId: 'gatopago.com',
  meraSessionMinutes: 15,
  stellar: null,
} as unknown as ClientSettings;
const owner = privateKeyToAddress(
  `0x${Buffer.from(meraEvmKey(meraSeed(new Uint8Array(32).fill(7)))).toString('hex')}`,
);

const session = {
  token: 'session',
  expiresAt: 4102444800,
  userId: 'usr_test',
  wallet: {
    address: '0x2222222222222222222222222222222222222222',
    credentialId: 'phone',
    owner,
    initialOwners: [],
  },
} as Session;

beforeEach(() => {
  vi.resetModules();
  prompt.calls = [];
  derivation.hold = null;
  const storage = new Map<string, string>();
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});

describe('Mera signing session', () => {
  it('asks for the passkey once when two screens need it at the same time, with a time limit', async () => {
    const { meraSigner } = await import('../src/wallet/mera');
    const first = meraSigner(settings, 'phone', owner);
    const second = meraSigner(settings, 'phone', owner);
    await vi.waitFor(() => expect(prompt.calls).toHaveLength(1));
    prompt.answer();
    const [a, b] = await Promise.all([first, second]);
    expect(a.address).toBe(owner);
    expect(b.address).toBe(owner);
    expect(prompt.calls).toEqual([expect.objectContaining({ timeout: 120_000 })]);
  });

  it('stops signing as soon as the person signs out', async () => {
    const { saveSession, signOut } = await import('../src/wallet/session');
    const { meraSigner } = await import('../src/wallet/mera');
    saveSession(session);
    const signing = meraSigner(settings, 'phone', owner);
    await vi.waitFor(() => expect(prompt.calls).toHaveLength(1));
    prompt.answer();
    const signer = await signing;
    expect(await signer.signMessage({ message: 'hola' })).toMatch(/^0x/);
    signOut();
    await expect(signer.signMessage({ message: 'hola' })).rejects.toThrow();
  });

  it('opens nothing with a passkey answer that arrives after signing out', async () => {
    const { saveSession, signOut } = await import('../src/wallet/session');
    const { meraSigner } = await import('../src/wallet/mera');
    saveSession(session);
    const late = meraSigner(settings, 'phone', owner);
    await vi.waitFor(() => expect(prompt.calls).toHaveLength(1));
    signOut();
    prompt.answer();
    await expect(late).rejects.toThrow('SIGNED_OUT');
  });

  it('opens nothing when signing out while its Stellar key is derived', async () => {
    const { saveSession, signOut } = await import('../src/wallet/session');
    const { meraSigner } = await import('../src/wallet/mera');
    const withStellar = { ...settings, stellar: { network: 'stellar:testnet' } } as ClientSettings;
    saveSession(session);
    let release = () => {};
    derivation.hold = new Promise((resolve) => (release = resolve));
    const late = meraSigner(withStellar, 'phone', owner);
    await vi.waitFor(() => expect(prompt.calls).toHaveLength(1));
    prompt.answer();
    signOut();
    release();
    await expect(late).rejects.toThrow('SIGNED_OUT');
    // No key stayed open: signing again asks for the passkey again.
    saveSession(session);
    derivation.hold = null;
    const again = meraSigner(withStellar, 'phone', owner);
    await vi.waitFor(() => expect(prompt.calls).toHaveLength(2));
    prompt.answer();
    expect((await again).address).toBe(owner);
  });
});
