'use client';

import { useEffect, useSyncExternalStore } from 'react';
import {
  erc20Abi,
  formatUnits,
  parseAbi,
  type Address,
  type ContractFunctionParameters,
} from 'viem';
import { walletNetwork } from '@gatopago/shared/networks';
import type { ClientSettings } from '../lib/settings';
import { publicClient, USDC_DECIMALS } from './account';
import { onMovement } from './push';
import type { Session } from './session';

const multicall3Abi = parseAbi(['function getEthBalance(address) view returns (uint256)']);

/** A read the screen already has is reused unless something happened since. */
const FRESH_MS = 30_000;

interface Snapshot {
  /** USDC per network: empty until the first read, `null` where a network could not be read. */
  usdc: Readonly<Record<string, bigint | null>>;
  native: Readonly<Record<string, bigint | null>>;
  /** USDC saved in Aave (its aToken) on the networks that have a market. */
  saved: Readonly<Record<string, bigint | null>>;
  refreshing: boolean;
}

const EMPTY: Snapshot = { usdc: {}, native: {}, saved: {}, refreshing: false };

/**
 * The account's balances on every network, shared by every screen: one Multicall3 call per network
 * reads USDC, the native token and USDC saved in Aave together. Reads happen when a screen first needs them, after the
 * account's own operations, on movement notifications and when the app becomes visible again;
 * never on a timer.
 */
class Balances {
  private snapshot = EMPTY;
  private readAt = 0;
  private reading: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();
  private stopMovements: (() => void) | null = null;

  constructor(
    private readonly settings: ClientSettings,
    private readonly address: Address,
  ) {}

  readonly get = () => this.snapshot;

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      document.addEventListener('visibilitychange', this.onVisible);
      this.stopMovements = onMovement(() => void this.refresh(true));
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        document.removeEventListener('visibilitychange', this.onVisible);
        this.stopMovements?.();
      }
    };
  };

  private readonly onVisible = () => {
    if (document.visibilityState === 'visible') void this.refresh();
  };

  private set(snapshot: Snapshot) {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }

  /** Reads again, unless a read is running or, when not `force`d, the last one is fresh. */
  refresh(force = false): Promise<void> {
    if (this.reading) return this.reading;
    if (!force && Date.now() - this.readAt < FRESH_MS) return Promise.resolve();
    this.set({ ...this.snapshot, refreshing: true });
    this.reading = this.read().finally(() => {
      this.reading = null;
    });
    return this.reading;
  }

  private async read() {
    const { networks } = this.settings;
    const results = await Promise.allSettled(
      networks.map((id) => {
        const { chain, usdc, aave } = walletNetwork(id);
        const balanceOf = (token: Address) =>
          ({
            address: token,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [this.address],
          }) as const;
        const contracts: ContractFunctionParameters[] = [
          balanceOf(usdc),
          {
            address: chain.contracts!.multicall3!.address,
            abi: multicall3Abi,
            functionName: 'getEthBalance',
            args: [this.address],
          },
          ...(aave ? [balanceOf(aave.aToken)] : []),
        ];
        return publicClient(this.settings, id).multicall({ allowFailure: false, contracts });
      }),
    );
    this.readAt = Date.now();
    const value = (i: number, index: number) => {
      const result = results[i];
      return result.status === 'fulfilled' ? (result.value[index] as bigint) : null;
    };
    this.set({
      usdc: Object.fromEntries(networks.map((id, i) => [id, value(i, 0)])),
      native: Object.fromEntries(networks.map((id, i) => [id, value(i, 1)])),
      saved: Object.fromEntries(
        networks
          .filter((id) => walletNetwork(id).aave)
          .map((id) => [id, value(networks.indexOf(id), 2)]),
      ),
      refreshing: false,
    });
  }
}

const stores = new Map<string, Balances>();

function balancesOf(settings: ClientSettings, address: Address) {
  const key = `${address}:${settings.networks.join(',')}`;
  let store = stores.get(key);
  if (!store) {
    store = new Balances(settings, address);
    stores.set(key, store);
  }
  return store;
}

/** Reads the signed-in account's balances again now: after its own operations or a notification. */
export const refreshBalances = (settings: ClientSettings, address: Address) =>
  balancesOf(settings, address).refresh(true);

export function useBalances(settings: ClientSettings, session: Session) {
  const store = balancesOf(settings, session.wallet.address);
  const snapshot = useSyncExternalStore(store.subscribe, store.get, () => EMPTY);
  useEffect(() => {
    void store.refresh();
  }, [store]);
  return {
    balances: snapshot.usdc,
    natives: snapshot.native,
    saved: snapshot.saved,
    refreshing: snapshot.refreshing,
    refresh: () => void store.refresh(true),
  };
}

export const formatUsdc = (amount: bigint) =>
  Number(formatUnits(amount, USDC_DECIMALS)).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
