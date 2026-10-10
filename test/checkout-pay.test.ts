import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientSettings } from '../src/lib/settings';
import type { Intent, Plan } from '../src/wallet/flow';
import type { Session } from '../src/wallet/session';

// The account's operation and Flow are simulated: what matters is what is sent and registered.
const fake = vi.hoisted(() => ({ send: vi.fn(), confirm: vi.fn() }));
vi.mock('../src/wallet/operations', () => ({ send: fake.send }));
vi.mock('../src/wallet/account', () => ({ publicClient: () => ({}) }));
vi.mock('@gatopago/shared/payments', async (original) => ({
  ...(await original<object>()),
  paymentCalls: () => [],
}));
vi.mock('../src/wallet/api', async (original) => ({
  ...(await original<object>()),
  api: async (_origin: string, path: string, init: { body?: unknown }) => {
    if (path.endsWith('/confirm')) return fake.confirm(init.body);
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
