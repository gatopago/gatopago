import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientSettings } from '../src/lib/settings';
import type { Session } from '../src/wallet/session';

// Wallet Core, the Stellar network and Mera are simulated: what matters is what the browser does.
const fake = vi.hoisted(() => ({
  api: vi.fn(),
  signer: vi.fn(),
  nonceUsed: vi.fn(),
  nonce: 0,
  fee: 0n,
  allowance: 0n,
  keys: [] as unknown[],
  signerKeys: [] as unknown[],
}));
vi.mock('../src/wallet/api', async (original) => ({
  ...(await original<object>()),
  api: fake.api,
}));
vi.mock('../src/wallet/activity', () => ({ invalidateActivity: () => {} }));
vi.mock('../src/wallet/mera', () => ({
  meraStellarKey: async () => ({ publicKey: `0x${'ab'.repeat(32)}` }),
  meraSigner: async () => ({ signMessage: async () => '0x01' }),
}));
vi.mock('@gatopago/shared/crosschain', () => ({ crosschainFee: async () => fake.fee }));
vi.mock('@gatopago/shared/stellar', () => ({
  stellarServer: () => ({ getLatestLedger: async () => ({ sequence: 100 }) }),
  stellarKeyApproval: (_network: unknown, account: string, key: string, expires: number) =>
    `approve ${account} ${key} ${expires}`,
  stellarAccountExists: async () => true,
  signerChangeOperations: async (...args: unknown[]) => {
    fake.signerKeys = args[4] as unknown[];
    return [];
  },
  isStellarKeySigner: fake.signer,
  stellarNonceUsed: fake.nonceUsed,
  toStellarUnits: (amount: bigint) => amount * 10n,
  transferOperation: () => 'transfer',
  crosschainToStellarCalls: () => [],
  crosschainOperation: () => 'burn',
  approveBurnsOperation: () => 'approve',
  BURN_APPROVAL_LEDGERS: 3_000_000,
  stellarBurnAllowance: async () => fake.allowance,
  signedStellarCall: async () => ({
    func: 'func',
    auth: [],
    nonces: [String(++fake.nonce)],
    validUntil: 150,
  }),
}));

const ACCOUNT = 'CACCOUNT';
const settings = {
  apiOrigin: 'https://api.gatopago.com',
  stellar: { network: 'stellar:testnet', rpcUrl: 'https://soroban-testnet.stellar.org' },
} as ClientSettings;
const session = {
  token: 'test-session',
  wallet: {
    address: '0x2222222222222222222222222222222222222222',
    credentialId: 'credential',
    owner: '0x3333333333333333333333333333333333333333',
    initialOwners: [],
  },
} as unknown as Session;

/** Wallet Core: the account and its approved keys, and the calls the browser submits. */
let submits: number;
let approvals: number;
let submit: () => Promise<unknown>;
let storage: Map<string, string>;
beforeEach(() => {
  vi.resetModules();
  fake.nonce = 0;
  fake.fee = 0n;
  fake.allowance = 0n;
  fake.keys = [];
  submits = 0;
  approvals = 0;
  submit = async () => ({ transaction_hash: `hash${submits}` });
  fake.signer.mockReset().mockResolvedValue(true);
  fake.nonceUsed.mockReset().mockResolvedValue(false);
  fake.api.mockReset().mockImplementation(async (_origin: string, path: string) => {
    const { ApiError } = await import('../src/wallet/api');
    if (path === 'stellar')
      return {
        network: 'stellar:testnet',
        account: ACCOUNT,
        deployed: true,
        sponsor: 'G',
        keys: fake.keys,
      };
    if (path === 'stellar/keys') return void approvals++;
    if (path.startsWith('stellar/submit?')) throw new ApiError(404, 'NOT_FOUND');
    if (path === 'stellar/submit') {
      submits++;
      return submit();
    }
    throw new Error(`unexpected ${path}`);
  });
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('a Stellar payment', () => {
  it('is never sent when it cannot be remembered', async () => {
    const { sendOnStellar } = await import('../src/wallet/stellar');
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {},
    });
    await expect(sendOnStellar(settings, session, 'GRECIPIENT', 1n)).rejects.toThrow(
      'STORAGE_UNAVAILABLE',
    );
    expect(submits).toBe(0);
  });

  it('whose answer is lost is looked up by its nonce, not sent again', async () => {
    const { sendOnStellar } = await import('../src/wallet/stellar');
    const { ApiError } = await import('../src/wallet/api');
    submit = async () => {
      throw new ApiError(0, 'NETWORK_ERROR');
    };
    await expect(sendOnStellar(settings, session, 'GRECIPIENT', 1n)).rejects.toThrow(
      'OPERATION_PENDING',
    );
    // Still valid on the network and unknown to Wallet Core: it may land, so nothing else goes.
    await expect(sendOnStellar(settings, session, 'GRECIPIENT', 1n)).rejects.toThrow(
      'OPERATION_PENDING',
    );
    expect(fake.api).toHaveBeenCalledWith(
      settings.apiOrigin,
      'stellar/submit?nonce=1',
      expect.anything(),
    );
    expect(submits).toBe(1);
    // It landed: the person checks it instead of paying again.
    fake.nonceUsed.mockResolvedValue(true);
    await expect(sendOnStellar(settings, session, 'GRECIPIENT', 1n)).rejects.toThrow(
      'PREVIOUS_OPERATION_CONFIRMED',
    );
    expect(submits).toBe(1);
  });

  it("from a Mera key the account does not sign with yet: approved once, sent once it's synced", async () => {
    const { sendOnStellar } = await import('../src/wallet/stellar');
    fake.signer.mockResolvedValue(false);
    for (let attempt = 0; attempt < 2; attempt++)
      await expect(sendOnStellar(settings, session, 'GRECIPIENT', 1n)).rejects.toThrow(
        'STELLAR_SIGNER_PENDING',
      );
    expect(approvals).toBe(1);
    expect(submits).toBe(0);
    // Another device synced it from Security: this one sends without approving it again.
    fake.signer.mockResolvedValue(true);
    expect(await sendOnStellar(settings, session, 'GRECIPIENT', 1n)).toBe('hash1');
    expect(approvals).toBe(1);
  });

  it('through CCTP takes a network holding exactly the amount when the fee is zero', async () => {
    const { planStellarSend } = await import('../src/wallet/stellar');
    const plan = await planStellarSend(settings, { 'eip155:43113': 10n }, 0n, 'GRECIPIENT', 10n);
    expect(plan).toMatchObject({ from: 'eip155:43113', fee: 0n });
    fake.fee = 1n;
    await expect(
      planStellarSend(settings, { 'eip155:43113': 10n }, 0n, 'GRECIPIENT', 10n),
    ).rejects.toThrow('INSUFFICIENT_FUNDS');
  });

  it("to another network says which signature it asks: Circle's permission first, once", async () => {
    const { crosschainFromStellar } = await import('../src/wallet/stellar');
    const move = { to: 'eip155:421614', amount: 1_000_000n, fee: 0n };
    const steps: string[] = [];
    await crosschainFromStellar(settings, session, move, (step) => steps.push(step));
    expect(steps).toEqual(['allowance', 'move']);
    expect(submits).toBe(2);
    // With the permission in place, one signature.
    fake.allowance = 10_000_000n;
    steps.length = 0;
    await crosschainFromStellar(settings, session, move, (step) => steps.push(step));
    expect(steps).toEqual(['move']);
    expect(submits).toBe(3);
  });

  it('signs in on Stellar only keys whose approval an owner signed', async () => {
    const { syncStellarSigners } = await import('../src/wallet/stellar');
    const { privateKeyToAccount, generatePrivateKey } = await import('viem/accounts');
    const { keyOwner } = await import('@gatopago/shared/wallet');
    const [owner, intruder] = [
      privateKeyToAccount(generatePrivateKey()),
      privateKeyToAccount(generatePrivateKey()),
    ];
    const approval = async (signer: typeof owner, key: string) => ({
      public_key: key,
      owner: owner.address,
      expires_at: 1,
      signature: await signer.signMessage({
        message: `approve ${session.wallet.address} ${key} 1`,
      }),
    });
    const [approved, forged] = [`0x${'aa'.repeat(32)}`, `0x${'bb'.repeat(32)}`];
    // Wallet Core lists both, each as approved by the owner; only one approval is the owner's.
    fake.keys = [await approval(owner, approved), await approval(intruder, forged)];
    await syncStellarSigners(settings, session, [keyOwner(owner.address)]);
    expect(fake.signerKeys).toEqual([approved]);
  });
});
