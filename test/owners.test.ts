import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientSettings } from '../src/lib/settings';
import type { Wallet } from '../src/wallet/session';

// The history's signatures are checked by the SDK (`verifiedOwners`, tested there with real
// signatures); this checks that a history shorter than one already known is refused.
const fake = vi.hoisted(() => ({ served: 1, applied: 1 as number | null }));
vi.mock('../src/wallet/api', () => ({
  api: async () => ({
    approvals: Array.from({ length: fake.served }, (_, sequence) => ({ sequence })),
  }),
}));
vi.mock('../src/wallet/account', () => ({ publicClient: () => ({}) }));
vi.mock('../src/wallet/operations', () => ({ appliedApprovals: async () => fake.applied }));
vi.mock('@gatopago/shared/wallet', () => ({ verifiedOwners: async () => ['0x01'] }));

const settings = { homeNetwork: 'eip155:421614' } as ClientSettings;
const wallet = {
  address: '0x2222222222222222222222222222222222222222',
  initialOwners: ['0x01'],
} as unknown as Wallet;

beforeEach(() => {
  vi.resetModules();
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
});

describe("the account's owners", () => {
  it('are refused when Wallet Core serves a history cut short', async () => {
    const { accountOwners } = await import('../src/wallet/owners');
    fake.served = 2;
    fake.applied = 1;
    expect((await accountOwners(settings, wallet)).owners).toEqual(['0x01']);
    // Shorter than what this device already saw.
    fake.served = 1;
    await expect(accountOwners(settings, wallet)).rejects.toThrow('APPROVALS_INVALID');
    // Shorter than what the home network already applied.
    vi.resetModules();
    const fresh = await import('../src/wallet/owners');
    localStorage.setItem(`gatopago.approvals.seen.${wallet.address.toLowerCase()}`, '0');
    fake.applied = 2;
    await expect(fresh.accountOwners(settings, wallet)).rejects.toThrow('APPROVALS_INVALID');
  });
});
