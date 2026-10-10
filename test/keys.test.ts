import { describe, expect, it, vi } from 'vitest';
import type { ClientSettings } from '../src/lib/settings';
import type { Session } from '../src/wallet/session';

vi.mock('../src/wallet/owners', () => ({
  accountOwners: async () => ({ owners: ['0x01'], approvals: [] }),
}));
vi.mock('../src/wallet/operations', () => ({
  appliedApprovals: async (_settings: unknown, _address: string, id: string) => {
    if (id === 'eip155:43113') throw new Error('RPC unavailable');
    return 0;
  },
}));
vi.mock('../src/wallet/stellar', () => ({ stellarSignerChanges: async () => null }));

describe("the account's keys", () => {
  it('stay visible when one network cannot be asked, which is never taken as up to date', async () => {
    const { readKeys } = await import('../src/wallet/keys');
    const settings = { networks: ['eip155:421614', 'eip155:43113'] } as unknown as ClientSettings;
    const session = {
      wallet: { address: '0x2222222222222222222222222222222222222222', initialOwners: ['0x01'] },
    } as unknown as Session;
    expect(await readKeys(settings, session)).toEqual({
      owners: ['0x01'],
      total: 0,
      applied: { 'eip155:421614': 0, 'eip155:43113': 'unread' },
      stellar: null,
    });
  });
});
