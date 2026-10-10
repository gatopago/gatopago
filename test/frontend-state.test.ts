import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientSettings } from '../src/lib/settings';
import type { Session } from '../src/wallet/session';

type Snapshot = {
  usdc: Record<string, bigint | null>;
  native: Record<string, bigint | null>;
  saved: Record<string, bigint | null>;
  refreshing: boolean;
};

const balances = vi.hoisted(() => ({
  multicall: vi.fn(),
  get: (): Snapshot => ({ usdc: {}, native: {}, saved: {}, refreshing: false }),
}));

// Exercise the shared balance store without starting a browser or calling a real RPC.
vi.mock('react', async (original) => ({
  ...(await original<object>()),
  useEffect: (effect: () => void) => effect(),
  useSyncExternalStore: (_subscribe: unknown, get: () => Snapshot) => {
    balances.get = get;
    return get();
  },
}));
vi.mock('../src/wallet/account', () => ({
  USDC_DECIMALS: 6,
  publicClient: (_settings: unknown, id: string) => ({
    multicall: (options: unknown) => balances.multicall(id, options),
  }),
}));
vi.mock('../src/wallet/push', () => ({ onMovement: () => () => {} }));
const stellar = vi.hoisted(() => ({ account: new Promise<never>(() => {}) }));
vi.mock('../src/wallet/stellar', () => ({
  knownStellarAccount: () => null,
  stellarAccount: () => stellar.account,
  stellarBalance: async () => 0n,
  stellarXlmBalance: async () => 0n,
}));

const networks = ['eip155:421614', 'eip155:43113'];
const settings: ClientSettings = {
  webOrigin: 'https://gatopago.com',
  apiOrigin: 'https://api.gatopago.com',
  businessOrigin: 'https://business.gatopago.com',
  networks,
  homeNetwork: networks[0],
  rpcUrls: {},
  turnstileSiteKey: '1x00000000000000000000AA',
  meraSessionMinutes: 15,
  passkeyRpId: 'localhost',
  stellar: null,
  push: null,
};
const session: Session = {
  token: 'test-session',
  expiresAt: 4102444800,
  userId: 'usr_test',
  wallet: {
    address: '0x1111111111111111111111111111111111111111',
    credentialId: 'test-passkey',
    owner: '0x3333333333333333333333333333333333333333',
    initialOwners: [],
  },
};
const values = (usdc: bigint) => [
  { status: 'success', result: usdc },
  { status: 'success', result: 2n },
  { status: 'failure', error: new Error('Aave unavailable') },
];

let storage: Map<string, string>;
beforeEach(() => {
  vi.resetModules();
  balances.multicall.mockReset();
  storage = new Map();
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('session state', () => {
  it('ignores corrupt or obsolete stored data without deleting the passkey', async () => {
    const { currentSession } = await import('../src/wallet/session');
    storage.set('gatopago.session', '{broken');
    expect(currentSession()).toBeNull();
    storage.set('gatopago.session', JSON.stringify({ token: 'old', expiresAt: session.expiresAt }));
    expect(currentSession()).toBeNull();
  });

  it('retains a page-only session when storage is blocked, and signs out correctly', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('Storage blocked');
      },
      setItem: () => {
        throw new Error('Storage blocked');
      },
      removeItem: () => {
        throw new Error('Storage blocked');
      },
    });
    const { saveSession, currentSession, signOut } = await import('../src/wallet/session');
    saveSession(session);
    expect(currentSession()).toEqual(session);
    expect(currentSession()).toBe(currentSession());
    signOut();
    expect(currentSession()).toBeNull();
  });

  it('shares one storage listener and notifies once per sign-in or sign-out', async () => {
    const { saveSession, signOut, subscribeSession } = await import('../src/wallet/session');
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const first = vi.fn(),
      second = vi.fn();
    const stopFirst = subscribeSession(first),
      stopSecond = subscribeSession(second);
    expect(add).toHaveBeenCalledTimes(1);
    saveSession(session);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    window.dispatchEvent(Object.assign(new Event('storage'), { key: 'unrelated-preference' }));
    expect(first).toHaveBeenCalledTimes(1);
    signOut();
    expect(first).toHaveBeenCalledTimes(2);
    stopFirst();
    expect(remove).not.toHaveBeenCalled();
    stopSecond();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('observes sign-out in another tab', async () => {
    const { saveSession, currentSession, subscribeSession } = await import('../src/wallet/session');
    saveSession(session);
    expect(currentSession()).not.toBeNull();
    const changed = vi.fn();
    const stop = subscribeSession(changed);
    storage.delete('gatopago.session');
    window.dispatchEvent(Object.assign(new Event('storage'), { key: 'gatopago.session' }));
    expect(changed).toHaveBeenCalledTimes(1);
    expect(currentSession()).toBeNull();
    stop();
  });
});

describe('bounded API requests', () => {
  it.each(['timeout', 'unmount'])(
    'preserves both timeout and caller cancellation (%s)',
    async (cause) => {
      const deadline = new AbortController(),
        caller = new AbortController();
      const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
      vi.stubGlobal(
        'fetch',
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal!.addEventListener('abort', () => reject(init.signal!.reason), {
              once: true,
            });
          }),
      );
      const { api } = await import('../src/wallet/api');
      const request = api(settings.apiOrigin, 'profile', { signal: caller.signal });
      const aborted = new DOMException('Cancelled', 'AbortError');
      const check =
        cause === 'timeout'
          ? expect(request).rejects.toMatchObject({ code: 'NETWORK_ERROR' })
          : expect(request).rejects.toBe(aborted);
      (cause === 'timeout' ? deadline : caller).abort(aborted);
      await check;
      expect(timeout).toHaveBeenCalledWith(20_000);
    },
  );
});

describe('shared balance reads', () => {
  it('publishes a fast network without waiting for a slow one, and isolates Aave failures', async () => {
    const slow = Promise.withResolvers<ReturnType<typeof values>>();
    balances.multicall.mockImplementation((id: string) =>
      id === networks[0] ? values(5n) : slow.promise,
    );
    const { useBalances } = await import('../src/wallet/balances');
    useBalances(settings, session);
    useBalances(settings, session);
    await vi.waitFor(() => expect(balances.get().usdc[networks[0]]).toBe(5n));
    expect(balances.multicall).toHaveBeenCalledTimes(2);
    expect(balances.get().native[networks[0]]).toBe(2n);
    expect(balances.get().saved[networks[0]]).toBeNull();
    expect(balances.get().usdc[networks[1]]).toBeUndefined();
    slow.resolve(values(7n));
    await vi.waitFor(() => expect(balances.get().refreshing).toBe(false));
    expect(balances.get().usdc[networks[1]]).toBe(7n);
    useBalances(settings, session);
    expect(balances.multicall).toHaveBeenCalledTimes(2);
  });

  it('reads every network at once while Wallet Core has not answered the Stellar account', async () => {
    balances.multicall.mockImplementation(() => values(5n));
    const { useBalances } = await import('../src/wallet/balances');
    const withStellar = { ...settings, stellar: { network: 'stellar:testnet', rpcUrl: '' } };
    const read = useBalances(withStellar as ClientSettings, session);
    await vi.waitFor(() => expect(balances.get().refreshing).toBe(false));
    expect(balances.multicall).toHaveBeenCalledTimes(2);
    expect(networks.map((id) => balances.get().usdc[id])).toEqual([5n, 5n]);
    // Stellar is still unknown: not a zero.
    expect(read.stellarUsdc).toBeUndefined();
  });

  it('never reports a failed network as a zero balance or a complete total', async () => {
    balances.multicall.mockImplementation((id: string) => {
      if (id === networks[1]) throw new Error('RPC unavailable');
      return values(5n);
    });
    const { useBalances } = await import('../src/wallet/balances');
    useBalances(settings, session);
    await vi.waitFor(() => expect(balances.get().refreshing).toBe(false));
    expect(balances.get().usdc[networks[0]]).toBe(5n);
    expect(balances.get().usdc[networks[1]]).toBeNull();
  });

  it('coalesces movement refreshes during an older read into one fresh batch', async () => {
    const older = Promise.withResolvers<ReturnType<typeof values>>();
    balances.multicall.mockImplementationOnce(() => older.promise).mockResolvedValue(values(9n));
    const { useBalances, refreshBalances } = await import('../src/wallet/balances');
    useBalances(settings, session);
    const refresh = refreshBalances(settings, session.wallet.address);
    expect(refreshBalances(settings, session.wallet.address)).toBe(refresh);
    older.resolve(values(5n));
    await refresh;
    expect(balances.multicall).toHaveBeenCalledTimes(4);
    expect(balances.get().usdc[networks[0]]).toBe(9n);
  });
});

describe('sharing exports', () => {
  const options = { filename: 'receipt.png', text: 'GatoPago receipt' };
  const node = {} as HTMLElement;

  it('does not render an image when sharing is unsupported', async () => {
    vi.stubGlobal('navigator', {});
    const { shareCard } = await import('../src/consumer/exportCard');
    await expect(shareCard(node, options)).resolves.toBe('unsupported');
  });

  it('distinguishes cancellation from unsupported sharing', async () => {
    vi.stubGlobal('navigator', {
      share: vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError')),
    });
    const { shareCard } = await import('../src/consumer/exportCard');
    await expect(shareCard(node, options)).resolves.toBe('cancelled');
  });

  it('shares text without rendering an unused image on text-only devices', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share });
    const { shareCard } = await import('../src/consumer/exportCard');
    await expect(shareCard(node, options)).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ text: options.text, url: undefined });
  });
});

describe('movement amounts', () => {
  it('reads each coin with its decimals: USDC and AUSD in 6, XLM in 7, native coins in 18', async () => {
    const { decimalsOf } = await import('../src/wallet/activity');
    const movement = (network: string, currency: string) =>
      ({ network, currency }) as Parameters<typeof decimalsOf>[0];
    expect(decimalsOf(movement('stellar:testnet', 'USDC'))).toBe(6);
    expect(decimalsOf(movement('stellar:testnet', 'XLM'))).toBe(7);
    expect(decimalsOf(movement('eip155:10143', 'AUSD'))).toBe(6);
    expect(decimalsOf(movement('eip155:10143', 'MON'))).toBe(18);
    expect(decimalsOf(movement('eip155:421614', 'ETH'))).toBe(18);
  });
});
