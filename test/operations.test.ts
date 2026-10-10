import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpRequestError, RpcRequestError } from 'viem';
import { entryPoint09Address, UserOperationReceiptNotFoundError } from 'viem/account-abstraction';
import type { ClientSettings } from '../src/lib/settings';
import type { Session } from '../src/wallet/session';

// The bundler and the account are simulated: what matters is what the browser remembers.
const fake = vi.hoisted(() => ({
  nonce: 7n,
  request: vi.fn(),
  receipt: vi.fn(),
  wait: vi.fn(),
}));
const sender = '0x2222222222222222222222222222222222222222';
vi.mock('../src/wallet/account', () => ({
  gatopagoAccount: async () => ({
    address: sender,
    entryPoint: { address: entryPoint09Address, version: '0.9' },
    getNonce: async () => fake.nonce,
    signUserOperation: async () => `0x${'11'.repeat(65)}`,
  }),
  publicClient: () => ({ getCode: async () => undefined }),
}));
vi.mock('../src/wallet/api', () => ({ api: async () => ({ approvals: [] }) }));
vi.mock('../src/wallet/activity', () => ({ invalidateActivity: () => {} }));
vi.mock('viem/account-abstraction', async (original) => ({
  ...(await original<object>()),
  createPaymasterClient: () => ({}),
  createBundlerClient: () => ({
    prepareUserOperation: async ({ nonce }: { nonce: bigint }) => ({
      sender,
      nonce,
      callData: '0x',
      callGasLimit: 1n,
      verificationGasLimit: 1n,
      preVerificationGas: 1n,
      maxFeePerGas: 1n,
      maxPriorityFeePerGas: 1n,
    }),
    request: fake.request,
    getUserOperationReceipt: fake.receipt,
    waitForUserOperationReceipt: fake.wait,
  }),
}));

const settings = { apiOrigin: 'https://api.gatopago.com' } as ClientSettings;
const session = { token: 'test-session' } as Session;
const network = 'eip155:421614';
const calls = [{ to: sender, data: '0x' }] as const;
const pending = () =>
  JSON.parse(storage.get(`gatopago.pending.${network}.${sender}`) ?? 'null') as {
    hash: string;
  } | null;

let storage: Map<string, string>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.resetModules();
  fake.nonce = 7n;
  for (const mock of [fake.request, fake.receipt, fake.wait]) mock.mockReset();
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('an operation whose result is unknown', () => {
  it('is remembered before sending and never allows another payment until it is settled', async () => {
    const { send } = await import('../src/wallet/operations');
    // The send's answer is lost.
    fake.request.mockRejectedValue(new HttpRequestError({ url: 'bundler', details: 'timeout' }));
    await expect(send(settings, session, network, calls)).rejects.toThrow('OPERATION_PENDING');
    const remembered = pending()?.hash;
    expect(remembered).toMatch(/^0x[0-9a-f]{64}$/);

    // Its receipt cannot be read either, and the nonce has not moved: still blocked, still known.
    fake.receipt.mockRejectedValue(new HttpRequestError({ url: 'bundler', details: 'timeout' }));
    await expect(send(settings, session, network, calls)).rejects.toThrow('OPERATION_PENDING');
    expect(pending()?.hash).toBe(remembered);
    expect(fake.request).toHaveBeenCalledTimes(1);

    // It landed: the person checks it instead of paying again.
    fake.receipt.mockResolvedValue({ success: true });
    await expect(send(settings, session, network, calls)).rejects.toThrow(
      'PREVIOUS_OPERATION_CONFIRMED',
    );
    expect(fake.receipt).toHaveBeenLastCalledWith({ hash: remembered });
    expect(pending()).toBe(null);
  });

  it('is not taken as paid because the nonce moved: only its own receipt counts', async () => {
    const { send } = await import('../src/wallet/operations');
    fake.request.mockRejectedValue(new HttpRequestError({ url: 'bundler', status: 502 }));
    await expect(send(settings, session, network, calls)).rejects.toThrow('OPERATION_PENDING');
    // Another device's operation (or a reverted one) used the nonce; the bundler does not know ours.
    fake.nonce = 8n;
    fake.receipt.mockRejectedValue(new UserOperationReceiptNotFoundError({ hash: '0x' }));
    await expect(send(settings, session, network, calls)).rejects.toThrow('OPERATION_PENDING');
    // Once its sponsorship expired it can never be included: it is forgotten and a new one goes.
    vi.setSystemTime(Date.now() + 10 * 60_000);
    fake.request.mockResolvedValue('0x');
    fake.wait.mockResolvedValue({ success: true, receipt: { transactionHash: '0xdef' } });
    expect(await send(settings, session, network, calls)).toBe('0xdef');
    expect(pending()).toBe(null);
  });

  it('stays remembered when its receipt cannot be asked for, even after it expired', async () => {
    const { send } = await import('../src/wallet/operations');
    fake.request.mockRejectedValue(new HttpRequestError({ url: 'bundler', details: 'timeout' }));
    await expect(send(settings, session, network, calls)).rejects.toThrow('OPERATION_PENDING');
    const remembered = pending()?.hash;
    vi.setSystemTime(Date.now() + 10 * 60_000);
    // Signed out, or rate limited: no answer about this operation, so it is not forgotten.
    for (const status of [401, 429]) {
      fake.receipt.mockRejectedValueOnce(new HttpRequestError({ url: 'bundler', status }));
      await expect(send(settings, session, network, calls)).rejects.toThrow('OPERATION_PENDING');
      expect(pending()?.hash).toBe(remembered);
    }
    // The bundler knows it was not included: only then is it forgotten.
    fake.receipt.mockRejectedValueOnce(
      new RpcRequestError({
        body: {},
        url: 'bundler',
        error: { code: -32500, message: 'UserOperation was not included' },
      }),
    );
    fake.request.mockResolvedValue('0x');
    fake.wait.mockResolvedValue({ success: true, receipt: { transactionHash: '0xfed' } });
    expect(await send(settings, session, network, calls)).toBe('0xfed');
    expect(fake.request).toHaveBeenCalledTimes(2);
  });

  it('is never sent when it cannot be remembered', async () => {
    const { send } = await import('../src/wallet/operations');
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
      removeItem: () => {},
    });
    await expect(send(settings, session, network, calls)).rejects.toThrow('STORAGE_UNAVAILABLE');
    expect(fake.request).not.toHaveBeenCalled();
  });

  it('is forgotten when the bundler refuses it, so the person can try again', async () => {
    const { send } = await import('../src/wallet/operations');
    fake.request.mockRejectedValueOnce(
      new RpcRequestError({
        body: {},
        url: 'bundler',
        error: { code: -32500, message: 'UserOperation execution reverts' },
      }),
    );
    await expect(send(settings, session, network, calls)).rejects.toThrow('execution reverts');
    expect(pending()).toBe(null);

    fake.request.mockResolvedValue('0x');
    fake.wait.mockResolvedValue({ success: true, receipt: { transactionHash: '0xabc' } });
    expect(await send(settings, session, network, calls)).toBe('0xabc');
    expect(pending()).toBe(null);
  });
});

describe('an operation in flight', () => {
  it('holds reloads and navigation until its result is known, whatever it is', async () => {
    const { send } = await import('../src/wallet/operations');
    const { isReloadBlocked } = await import('../src/pwa/reload-guard');
    let blocked = false;
    fake.request.mockImplementation(async () => {
      blocked = isReloadBlocked();
      return '0x';
    });
    fake.wait.mockResolvedValue({ success: false });
    await expect(send(settings, session, network, calls)).rejects.toThrow('OPERATION_REVERTED');
    expect(blocked).toBe(true);
    expect(isReloadBlocked()).toBe(false);
  });
});
