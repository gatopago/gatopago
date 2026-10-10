import type { Hex } from 'viem';
import type { ClientSettings } from '../lib/settings';
import { appliedApprovals } from './operations';
import { accountOwners } from './owners';
import type { Session } from './session';
import { stellarSignerChanges } from './stellar';

/** The account's keys as Security shows them, and where their latest change is applied. */
export type KeysState = {
  owners: Hex[];
  total: number;
  /**
   * Approvals applied on each network: `null` where the account does not exist, `unread` where the
   * network could not be asked (never taken as up to date).
   */
  applied: Record<string, number | null | 'unread'>;
  /** Signer changes pending on Stellar (`stellarSignerChanges`), `null` when it is off. */
  stellar: number | 'unused' | null;
};

/** Reads the keys: one network or Stellar out of reach hides neither the keys nor the others. */
export async function readKeys(settings: ClientSettings, session: Session): Promise<KeysState> {
  const { wallet } = session;
  // Verified here: the owners decide which keys Stellar signs with, and Wallet Core serves them.
  const [{ owners, approvals }, applied] = await Promise.all([
    accountOwners(settings, wallet),
    Promise.all(
      settings.networks.map((id) =>
        appliedApprovals(settings, wallet.address, id).catch(() => 'unread' as const),
      ),
    ),
  ]);
  return {
    owners,
    total: approvals.length,
    applied: Object.fromEntries(settings.networks.map((id, i) => [id, applied[i]])),
    stellar: await stellarSignerChanges(settings, session, owners).catch(() => null),
  };
}
