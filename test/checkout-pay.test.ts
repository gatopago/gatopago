import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientSettings } from '../src/lib/settings';
import type { Intent, Plan } from '../src/wallet/flow';
import type { Session } from '../src/wallet/session';

// The account's operation and Flow are simulated: what matters is what is sent and registered.
const fake = vi.hoisted(() => ({
  send: vi.fn(),
  confirm: vi.fn(),
  receipt: vi.fn(),
  sendTransaction: vi.fn(),
}));
vi.mock('../src/wallet/operations', () => ({ send: fake.send }));
vi.mock('../src/wallet/account', () => ({
  publicClient: () => ({
    waitForTransactionReceipt: fake.receipt,
    getBlock: async () => ({ baseFeePerGas: 1n }),
    estimateMaxPriorityFeePerGas: async () => 1n,
  }),
}));
// A browser wallet that signs the permit and returns the payment's hash.
vi.mock('viem', async (original) => ({
  ...(await original<object>()),
  createWalletClient: () => ({
    requestAddresses: async () => ['0x1111111111111111111111111111111111111111'],
    switchChain: async () => {},
    signTypedData: async () => '0xpermit',
    sendTransaction: fake.sendTransaction,
  }),
}));
vi.mock('@gatopago/shared/payments', async (original) => ({
  ...(await original<object>()),
  paymentCalls: () => [],
  paymentPermit: async () => ({}),
  payWithPermitCall: () => ({}),
}));
vi.mock('../src/wallet/api', async (original) => ({
  ...(await original<object>()),
  api: async (_origin: string, path: string, init: { body?: unknown }) => {
    if (path.endsWith('/confirm')) return fake.confirm(init.body);
    if (path.endsWith('/authorize'))
      return {
        total: '18',
        payment: { amount: '18000000', fee: '0', maxCctpFee: '0' },
        signature: '0xsig',
      };
    throw new Error(`unexpected ${path}`);
  },
}));

const settings = { apiOrigin: 'https://api.gatopago.com' } as ClientSettings;
const session = {} as Session;
const intent = { id: 'pi_1' } as Intent;
const plan = { network: 'eip155:421614' } as Plan;

beforeEach(() => {
  vi.resetModules();
  fake.send.mockReset().mockResolvedValue('0xpaid');
  fake.confirm.mockReset();
  fake.receipt.mockReset();
  fake.sendTransaction.mockReset().mockResolvedValue('0xwallet');
  vi.stubGlobal('window', { ethereum: {} });
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('paying a checkout with the account', () => {
  it('registers the same payment again when Flow did not answer, never paying twice', async () => {
    const { payWithAccount } = await import('../src/wallet/flow');
    const { ApiError } = await import('../src/wallet/api');
    fake.confirm.mockRejectedValueOnce(new ApiError(503, 'UNAVAILABLE'));
    await expect(payWithAccount(settings, session, intent, plan)).rejects.toThrow(
      'PAYMENT_NOT_REGISTERED',
    );
    // After a reload too: the retry only tells Flow about the transaction that paid.
    vi.resetModules();
    const again = await import('../src/wallet/flow');
    fake.confirm.mockResolvedValueOnce({ id: 'pi_1', status: 'succeeded' });
    expect(await again.payWithAccount(settings, session, intent, plan)).toEqual({
      id: 'pi_1',
      status: 'succeeded',
    });
    expect(fake.send).toHaveBeenCalledOnce();
    expect(fake.confirm).toHaveBeenLastCalledWith({
      network: 'eip155:421614',
      transaction_hash: '0xpaid',
    });
  });
});

describe('paying a checkout with a browser wallet', () => {
  const network = 'eip155:421614';

  it('keeps the transaction as soon as it has a hash, and follows it after a reload', async () => {
    const { payWithBrowserWallet } = await import('../src/wallet/flow');
    fake.receipt.mockRejectedValueOnce(new Error('RPC timeout'));
    await expect(payWithBrowserWallet(settings, intent, network)).rejects.toThrow(
      'PAYMENT_PENDING',
    );
    expect(fake.confirm).not.toHaveBeenCalled();
    // After a reload: the same transaction is followed and registered, never a second one.
    vi.resetModules();
    const again = await import('../src/wallet/flow');
    fake.receipt.mockResolvedValueOnce({ status: 'success' });
    fake.confirm.mockResolvedValueOnce({ id: 'pi_1', status: 'succeeded' });
    expect(await again.payWithBrowserWallet(settings, intent, network)).toEqual({
      id: 'pi_1',
      status: 'succeeded',
    });
    expect(fake.sendTransaction).toHaveBeenCalledOnce();
    expect(fake.confirm).toHaveBeenCalledWith({ network, transaction_hash: '0xwallet' });
    expect(localStorage.getItem('gatopago.checkout.sent.pi_1')).toBeNull();
  });

  it('forgets a reverted transaction, so paying again is possible', async () => {
    const { payWithBrowserWallet } = await import('../src/wallet/flow');
    fake.receipt.mockResolvedValueOnce({ status: 'reverted' });
    await expect(payWithBrowserWallet(settings, intent, network)).rejects.toThrow(
      'PAYMENT_REVERTED',
    );
    expect(fake.confirm).not.toHaveBeenCalled();
    expect(localStorage.getItem('gatopago.checkout.sent.pi_1')).toBeNull();
    fake.receipt.mockResolvedValueOnce({ status: 'success' });
    fake.confirm.mockResolvedValueOnce({ id: 'pi_1', status: 'succeeded' });
    await payWithBrowserWallet(settings, intent, network);
    expect(fake.sendTransaction).toHaveBeenCalledTimes(2);
  });
});
