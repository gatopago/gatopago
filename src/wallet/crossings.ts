import type { Address } from 'viem';

/**
 * Crossings between networks whose burn this device confirmed, kept until the USDC arrives: a
 * reload or leaving the screen comes back to the same crossing, never to another burn. Public
 * data only (networks, amount, the burn's hash).
 */
export interface Crossing {
  from: string;
  to: string;
  /** USDC in 6 decimals, as a decimal string. */
  amount: string;
  hash: string;
  at: number;
}

/** Older crossings have long arrived, or need support rather than this screen. */
const KEEP_MS = 7 * 86_400_000;
const key = (account: Address) => `gatopago.crossings.${account.toLowerCase()}`;

/** This account's crossings still on their way, newest first. */
export function crossingsOf(account: Address): Crossing[] {
  try {
    const kept = JSON.parse(localStorage.getItem(key(account)) ?? '[]') as Crossing[];
    return kept.filter((crossing) => Date.now() - crossing.at < KEEP_MS);
  } catch {
    return [];
  }
}

function keep(account: Address, crossings: Crossing[]) {
  try {
    localStorage.setItem(key(account), JSON.stringify(crossings));
  } catch {
    // Without storage the crossing is followed while the screen stays open.
  }
}

export function rememberCrossing(account: Address, crossing: Omit<Crossing, 'at'>) {
  keep(account, [
    { ...crossing, at: Date.now() },
    ...crossingsOf(account).filter((kept) => kept.hash !== crossing.hash),
  ]);
}

/** Forgets a crossing once its USDC arrived. */
export function forgetCrossing(account: Address, hash: string) {
  keep(
    account,
    crossingsOf(account).filter((kept) => kept.hash !== hash),
  );
}
