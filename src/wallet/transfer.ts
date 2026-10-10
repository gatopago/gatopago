import { encodeFunctionData, erc20Abi, type Address } from 'viem';
import { crosschainCalls, crosschainFee } from '@gatopago/shared/crosschain';
import { walletNetwork } from '@gatopago/shared/networks';

/** A USDC transfer: on one network when `from` is `to`, otherwise through Circle's CCTP. */
export interface Transfer {
  readonly from: string;
  readonly to: string;
  readonly recipient: Address;
  /** What the recipient receives. */
  readonly amount: bigint;
  /** Most that CCTP can charge on top (zero on one network). */
  readonly fee: bigint;
}

/**
 * A send starts on the destination network when it holds enough (no fee). Otherwise, when
 * `crossNetwork` (withdrawals to an address), it starts on the network holding the most, through
 * CCTP; payments to a @username never pay a Circle fee by surprise.
 */
export async function planTransfer(
  balances: Record<string, bigint | null>,
  to: string,
  recipient: Address,
  amount: bigint,
  crossNetwork: boolean,
): Promise<Transfer> {
  if ((balances[to] ?? 0n) >= amount) return { from: to, to, recipient, amount, fee: 0n };
  // Gathering from other networks only helps when, all together, they cover it.
  const total = Object.values(balances).reduce<bigint>((sum, balance) => sum + (balance ?? 0n), 0n);
  if (total < amount) throw new Error('INSUFFICIENT_FUNDS');
  if (!crossNetwork) throw new Error('BALANCE_ON_OTHER_NETWORK');
  const sources = Object.entries(balances)
    .filter(([id, balance]) => id !== to && (balance ?? 0n) > amount)
    .sort(([, a], [, b]) => ((b ?? 0n) > (a ?? 0n) ? 1 : -1));
  for (const [from, balance] of sources) {
    const fee = await crosschainFee(walletNetwork(from), walletNetwork(to), amount);
    if ((balance ?? 0n) >= amount + fee) return { from, to, recipient, amount, fee };
  }
  throw new Error('INSUFFICIENT_FUNDS');
}

/** The calls the account sends on `transfer.from`. */
export function transferCalls(transfer: Transfer) {
  if (transfer.from === transfer.to)
    return [
      {
        to: walletNetwork(transfer.to).usdc,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: 'transfer',
          args: [transfer.recipient, transfer.amount],
        }),
      },
    ];
  return crosschainCalls({
    from: walletNetwork(transfer.from),
    to: walletNetwork(transfer.to),
    amount: transfer.amount + transfer.fee,
    recipient: transfer.recipient,
    maxFee: transfer.fee,
  });
}
