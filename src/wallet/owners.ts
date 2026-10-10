import type { Hex } from 'viem';
import { walletContracts } from '@gatopago/shared/networks';
import { verifiedOwners } from '@gatopago/shared/wallet';
import type { ClientSettings } from '../lib/settings';
import { publicClient } from './account';
import { api, type Approvals } from './api';
import { appliedApprovals } from './operations';
import type { Wallet } from './session';

/** The newest approval count this device saw for an account: a shorter history is refused. */
const seenKey = (wallet: Wallet) => `gatopago.approvals.seen.${wallet.address.toLowerCase()}`;

function seen(wallet: Wallet) {
  try {
    return Number(localStorage.getItem(seenKey(wallet)) ?? 0);
  } catch {
    return 0;
  }
}

/**
 * The account's owners now and its approvals, checked here: Wallet Core serves the history, but
 * every approval is verified in order from the account's initial owners (`verifiedOwners`), so it
 * cannot slip in an owner. It cannot hide a later one either: the history may not be shorter than
 * what the home network already applied or this device already saw. Throws `APPROVALS_INVALID`.
 */
export async function accountOwners(
  settings: ClientSettings,
  wallet: Wallet,
): Promise<{ owners: Hex[]; approvals: Approvals['approvals'] }> {
  const { approvals } = await api<Approvals>(settings.apiOrigin, `approvals/${wallet.address}`);
  const [owners, applied] = await Promise.all([
    verifiedOwners(publicClient(settings, settings.homeNetwork), {
      factory: walletContracts.factory,
      account: wallet.address,
      initialOwners: wallet.initialOwners,
      approvals,
    }),
    appliedApprovals(settings, wallet.address, settings.homeNetwork),
  ]);
  if (approvals.length < Math.max(applied ?? 0, seen(wallet))) throw new Error('APPROVALS_INVALID');
  try {
    localStorage.setItem(seenKey(wallet), String(approvals.length));
  } catch {
    // Without storage this device only misses the check against what it saw before.
  }
  return { owners, approvals };
}
