import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeFunctionData, erc20Abi } from 'viem';
import { planTransfer, transferCalls } from '../src/wallet/transfer';

const [arbitrum, fuji, monad] = ['eip155:421614', 'eip155:43113', 'eip155:10143'];
const recipient = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
afterEach(() => vi.unstubAllGlobals());

describe('one balance across networks', () => {
  it('sends on the destination network when it holds enough, without fee', async () => {
    const transfer = await planTransfer(
      { [arbitrum]: 50n, [fuji]: 0n },
      arbitrum,
      recipient,
      40n,
      false,
    );
    expect(transfer).toEqual({ from: arbitrum, to: arbitrum, recipient, amount: 40n, fee: 0n });
    const [call] = transferCalls(transfer);
    expect(decodeFunctionData({ abi: erc20Abi, data: call.data }).args).toEqual([recipient, 40n]);
  });

  it('withdrawing to an address crosses from the network holding the most, so it arrives in full', async () => {
    vi.stubGlobal('fetch', async () =>
      Response.json([
        { finalityThreshold: 1000, minimumFee: 0, forwardFee: { high: 200_000 } },
        { finalityThreshold: 2000, minimumFee: 0, forwardFee: { high: 200_000 } },
      ]),
    );
    const balances = { [arbitrum]: 1_000_000n, [fuji]: 9_000_000n, [monad]: 30_000_000n };
    const transfer = await planTransfer(balances, arbitrum, recipient, 5_000_000n, true);
    expect(transfer).toEqual({
      from: monad,
      to: arbitrum,
      recipient,
      amount: 5_000_000n,
      fee: 200_000n,
    });
    // approve and burn amount + fee; Circle takes at most the fee.
    const [approve] = transferCalls(transfer);
    expect(decodeFunctionData({ abi: erc20Abi, data: approve.data }).args[1]).toBe(5_200_000n);
  });

  it('never crosses networks for a @username payment', async () => {
    await expect(
      planTransfer({ [arbitrum]: 1n, [fuji]: 100n }, arbitrum, recipient, 5n, false),
    ).rejects.toThrow('BALANCE_ON_OTHER_NETWORK');
  });

  it('reports insufficient funds when no single network covers the amount and fee', async () => {
    await expect(
      planTransfer({ [arbitrum]: 1n, [fuji]: 2n }, arbitrum, recipient, 3n, true),
    ).rejects.toThrow('INSUFFICIENT_FUNDS');
  });
});
