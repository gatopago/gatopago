'use client';

import { useEffect, useSyncExternalStore } from 'react';
import {
  erc20Abi,
  formatUnits,
  isAddressEqual,
  parseAbi,
  type Address,
  type ContractFunctionParameters,
} from 'viem';
import type { WalletHolding } from '@gatopago/shared/assets';
import { walletNetwork } from '@gatopago/shared/networks';
import type { ClientSettings } from '../lib/settings';
import { publicClient, USDC_DECIMALS } from './account';
import { onMovement } from './push';
import type { Session } from './session';
import { knownStellarAccount, stellarAccount, stellarBalance, stellarXlmBalance } from './stellar';

const multicall3Abi = parseAbi(['function getEthBalance(address) view returns (uint256)']);

/** A read the screen already has is reused unless something happened since. */
const FRESH_MS = 30_000;

interface Snapshot {
  /** USDC per network: empty until the first read, `null` where a network could not be read. */
  usdc: Readonly<Record<string, bigint | null>>;
  native: Readonly<Record<string, bigint | null>>;
  /** USDC saved in Aave (its aToken) on the networks that have a market. */
  saved: Readonly<Record<string, bigint | null>>;
  /** Other configured coins (AUSD), per network and token address. */
  tokens: Readonly<Record<string, Readonly<Record<Address, bigint | null>>>>;
  /** The Stellar account, its USDC and XLM: `null` when Stellar is off, `undefined` until read. */
  stellar: { account: string; usdc: bigint | null; xlm: bigint | null } | null | undefined;
  refreshing: boolean;
}

const EMPTY: Snapshot = {
  usdc: {},
  native: {},
  saved: {},
  tokens: {},
  stellar: undefined,
  refreshing: false,
};

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
  private reread = false;
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
    if (this.reading) {
      if (force) this.reread = true;
      return this.reading;
    }
    if (!force && Date.now() - this.readAt < FRESH_MS) return Promise.resolve();
    this.set({ ...this.snapshot, refreshing: true });
    this.reading = this.readUntilFresh().finally(() => {
      this.reading = null;
      this.set({ ...this.snapshot, refreshing: false });
    });
    return this.reading;
  }

  private async readUntilFresh() {
    do {
      this.reread = false;
      await this.read();
    } while (this.reread);
  }

  private async read() {
    const { networks } = this.settings;
    await Promise.all([
      this.readStellar(),
      ...networks.map(async (id) => {
        const { chain, usdc, aave, tokens = [] } = walletNetwork(id);
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
          ...tokens.map((token) => balanceOf(token.address)),
        ];
        let values: (bigint | null)[] = contracts.map(() => null);
        try {
          const results = await publicClient(this.settings, id).multicall({ contracts });
          values = results.map((result) =>
            result.status === 'success' && typeof result.result === 'bigint' ? result.result : null,
          );
        } catch {
          // A failed network is unknown, never a zero balance.
        }
        const held = Object.fromEntries(
          tokens.map((token, i) => [token.address, values[(aave ? 3 : 2) + i]]),
        );
        if (
          this.snapshot.usdc[id] === values[0] &&
          this.snapshot.native[id] === values[1] &&
          (!aave || this.snapshot.saved[id] === values[2]) &&
          tokens.every(({ address }) => this.snapshot.tokens[id]?.[address] === held[address])
        )
          return;
        this.set({
          ...this.snapshot,
          usdc: { ...this.snapshot.usdc, [id]: values[0] },
          native: { ...this.snapshot.native, [id]: values[1] },
          saved: aave ? { ...this.snapshot.saved, [id]: values[2] } : this.snapshot.saved,
          tokens: tokens.length ? { ...this.snapshot.tokens, [id]: held } : this.snapshot.tokens,
        });
      }),
    ]);
    this.readAt = Date.now();
  }

  /** Reads the Stellar balances alone: once Wallet Core answered the Stellar account. */
  async readStellar() {
    const known = this.settings.stellar ? knownStellarAccount(this.address) : null;
    // Not asked for yet: kept as it was until a screen with the session asks.
    if (this.settings.stellar && !known) return;
    const account = await known?.catch(() => null);
    const stellar = account
      ? await Promise.all([
          stellarBalance(this.settings, account.account).catch(() => null),
          stellarXlmBalance(this.settings, account.account).catch(() => null),
        ]).then(([usdc, xlm]) => ({ account: account.account, usdc, xlm }))
      : null;
    const current = this.snapshot.stellar;
    if (
      current === stellar ||
      (current && stellar && current.usdc === stellar.usdc && current.xlm === stellar.xlm)
    )
      return;
    this.set({ ...this.snapshot, stellar });
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
    // The first time, the Stellar account comes from Wallet Core: its balance follows on its own,
    // without holding the other networks back. If it fails, Stellar stays unknown, never zero.
    if (settings.stellar && !knownStellarAccount(session.wallet.address))
      void stellarAccount(settings, session).then(
        () => store.readStellar(),
        () => undefined,
      );
  }, [store, settings, session]);
  const { stellar } = snapshot;
  return {
    balances: snapshot.usdc,
    natives: snapshot.native,
    saved: snapshot.saved,
    /**
     * The balance of one holding of a coin (`walletAssets`): USDC, a token or the native coin,
     * Stellar's (XLM) included.
     */
    holding: (holding: WalletHolding) =>
      holding.networkId === settings.stellar?.network
        ? stellar?.xlm
        : holding.token === null
          ? snapshot.native[holding.networkId]
          : isAddressEqual(holding.token, walletNetwork(holding.networkId).usdc)
            ? snapshot.usdc[holding.networkId]
            : snapshot.tokens[holding.networkId]?.[holding.token],
    /** The Stellar account, its USDC and XLM, `null` when Stellar is off. */
    stellar,
    /** USDC on Stellar to add to totals: zero when Stellar is off. */
    stellarUsdc: stellar === null ? 0n : stellar?.usdc,
    refreshing: snapshot.refreshing,
    refresh: () => void store.refresh(true),
  };
}

/** A total is shown only when every configured network has a known balance. */
export function totalUsdc(
  balances: Readonly<Record<string, bigint | null>>,
  networks: readonly string[],
): bigint | null | undefined {
  let total = 0n;
  for (const id of networks) {
    const value = balances[id];
    if (value == null) return value;
    total += value;
  }
  return total;
}

/**
 * An exact amount of any coin by its decimals (6 for USDC, 7 for XLM, 18 for ETH): every decimal
 * it has, never rounded and without going through `Number`. What is signed and what a receipt
 * says: one stroop is 0,0000001 XLM, never 0,00.
 */
export function formatAmount(amount: bigint, decimals: number, en: boolean, minimumDigits = 0) {
  const negative = amount < 0n;
  const [whole, fraction = ''] = formatUnits(negative ? -amount : amount, decimals).split('.');
  const digits = fraction.padEnd(minimumDigits, '0');
  const grouped = new Intl.NumberFormat(en ? 'en' : 'es').format(BigInt(whole));
  return `${negative ? '-' : ''}${grouped}${digits ? (en ? '.' : ',') + digits : ''}`;
}

/** A coin's balance: up to six decimals, cut rather than rounded so it never shows more. */
export const formatHolding = (amount: bigint, decimals: number, en: boolean) =>
  decimals <= 6
    ? formatAmount(amount, decimals, en)
    : formatAmount(amount / 10n ** BigInt(decimals - 6), 6, en);

/** An exact USDC amount (a transfer, a fee): two to six decimals, in the app's language. */
export const formatUsdc = (amount: bigint, en: boolean) =>
  formatAmount(amount, USDC_DECIMALS, en, 2);

/** A balance: two decimals, cut rather than rounded so it never shows more than there is. */
export const formatBalance = (amount: bigint, en: boolean) =>
  (Number(amount / 10n ** BigInt(USDC_DECIMALS - 2)) / 100).toLocaleString(en ? 'en' : 'es', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
