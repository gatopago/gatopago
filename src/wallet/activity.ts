'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Address } from 'viem';
import type { ReceiptData } from '../consumer/PaymentSheets';
import type { ClientSettings } from '../lib/settings';
import { walletNetwork, XLM_DECIMALS } from '@gatopago/shared/networks';
import { shortAddress, USDC_DECIMALS } from './account';
import { api } from './api';
import { useFailureMessage } from './messages';
import { onMovement } from './push';
import type { Session } from './session';
import type { useTranslations } from 'next-intl';

/** A USDC movement of the account, as Wallet Core indexes it from the chain. */
export interface Movement {
  id: string;
  network: string;
  /** `0x…` on EVM networks, bare hex on Stellar. */
  transaction_hash: string;
  /** Seconds since the epoch. */
  timestamp: number;
  direction: 'sent' | 'received';
  kind: 'transfer' | 'crosschain' | 'payment' | 'earn' | 'swap' | 'settlement';
  currency: string;
  /** Atomic units. */
  amount: string;
  counterparty: Address | null;
  counterparty_username: string | null;
  counterparty_display_name: string | null;
}

interface ActivityPage {
  activity: Movement[];
  next_cursor: string | null;
}

const FRESH_MS = 30_000;
const recent = new Map<string, { movements: Movement[]; cursor: string | null; readAt: number }>();
const reading = new Map<string, Promise<ActivityPage>>();

/** A completed operation or movement notification makes the next read fresh. */
export function invalidateActivity(token: string) {
  recent.delete(token);
  reading.delete(token);
}

/** Reuse a recent first page, or share its pending read across mounted screens. */
function firstPage(apiOrigin: string, token: string): Promise<ActivityPage> {
  const cached = recent.get(token);
  if (cached && Date.now() - cached.readAt < FRESH_MS)
    return Promise.resolve({ activity: cached.movements, next_cursor: cached.cursor });
  const pending = reading.get(token);
  if (pending) return pending;
  const request: Promise<ActivityPage> = api<ActivityPage>(apiOrigin, 'activity', { token })
    .then((page) => {
      if (reading.get(token) === request)
        recent.set(token, {
          movements: page.activity,
          cursor: page.next_cursor,
          readAt: Date.now(),
        });
      return page;
    })
    .finally(() => {
      if (reading.get(token) === request) reading.delete(token);
    });
  reading.set(token, request);
  return request;
}

/** The account's movements, newest first, a page at a time. */
export function useActivity(settings: ClientSettings, session: Session) {
  const messageFor = useFailureMessage();
  const cached = recent.get(session.token);
  const [movements, setMovements] = useState<Movement[] | null>(cached?.movements ?? null);
  const [cursor, setCursor] = useState<string | null>(cached?.cursor ?? null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  // A movement notification reads the first page again.
  const [revision, setRevision] = useState(0);
  // Which reading of the list a "load more" continues: a page from before a fresh first page
  // belongs to another snapshot (its cursor would skip or repeat movements), so it is dropped.
  const snapshot = useRef(0);
  useEffect(
    () =>
      onMovement(() => {
        invalidateActivity(session.token);
        setRevision((value) => value + 1);
      }),
    [session.token],
  );

  const page = useCallback(
    (before: string | null, signal?: AbortSignal) =>
      api<ActivityPage>(
        settings.apiOrigin,
        before ? `activity?before=${encodeURIComponent(before)}` : 'activity',
        { token: session.token, signal },
      ),
    [settings.apiOrigin, session.token],
  );

  useEffect(() => {
    let active = true;
    firstPage(settings.apiOrigin, session.token)
      .then(({ activity, next_cursor }) => {
        if (!active) return;
        snapshot.current++;
        setMovements(activity);
        setCursor(next_cursor);
        setLoadingMore(false);
        setError('');
      })
      .catch((failure: unknown) => {
        if (active) setError(messageFor(failure));
      });
    // The shared GET may finish for the next screen; the API still bounds it to 20 seconds.
    return () => {
      active = false;
    };
  }, [settings.apiOrigin, messageFor, revision, session.token]);

  function loadMore() {
    if (!cursor || loadingMore) return;
    const reading = snapshot.current;
    setLoadingMore(true);
    page(cursor)
      .then(({ activity, next_cursor }) => {
        if (reading !== snapshot.current) return;
        setMovements((current) => {
          const known = new Set((current ?? []).map(({ id }) => id));
          return [...(current ?? []), ...activity.filter(({ id }) => !known.has(id))];
        });
        setCursor(next_cursor);
      })
      .catch((failure: unknown) => {
        if (reading === snapshot.current) setError(messageFor(failure));
      })
      .finally(() => {
        if (reading === snapshot.current) setLoadingMore(false);
      });
  }

  return { movements, hasMore: cursor !== null, loadingMore, loadMore, error };
}

/** The words of a movement's row and receipt (`useTranslations('Movements')`). */
export type MovementTexts = ReturnType<typeof useTranslations<'Movements'>>;

/** V2's row presentation: who first, then what happened. */
export function presentMovement(movement: Movement, t: MovementTexts) {
  const sent = movement.direction === 'sent';
  const identity =
    movement.counterparty_display_name ||
    (movement.counterparty_username ? `@${movement.counterparty_username}` : null);
  if (movement.kind === 'swap') return { title: t('swap'), detail: 'Uniswap' };
  if (movement.kind === 'settlement')
    return { title: t('settlement'), detail: t(sent ? 'sentAgora' : 'receivedAgora') };
  if (movement.kind === 'earn')
    return { title: t('grow'), detail: t(sent ? 'depositedAave' : 'withdrawnAave') };
  const detail =
    movement.kind === 'crosschain'
      ? t(sent ? 'sentOtherNetwork' : 'arrivedOtherNetwork')
      : movement.kind === 'payment'
        ? t(sent ? 'merchantPayment' : 'collected')
        : t(sent ? 'paymentSent' : identity ? 'paymentReceived' : 'depositReceived');
  const title =
    identity ??
    (movement.kind === 'crosschain'
      ? t('betweenNetworks')
      : movement.counterparty
        ? `Wallet ${shortAddress(movement.counterparty)}`
        : 'GatoPago');
  return { title, detail };
}

/**
 * Decimals of the coin a movement moved: USDC's, a configured token's (AUSD), the network's own
 * coin's (ETH, AVAX, MON) or XLM's.
 */
export function decimalsOf(movement: Movement) {
  if (movement.currency === 'USDC') return USDC_DECIMALS;
  if (!movement.network.startsWith('eip155:'))
    return movement.currency === 'XLM' ? XLM_DECIMALS : USDC_DECIMALS;
  const { chain, tokens } = walletNetwork(movement.network);
  if (movement.currency === chain.nativeCurrency.symbol) return chain.nativeCurrency.decimals;
  return tokens?.find(({ symbol }) => symbol === movement.currency)?.decimals ?? USDC_DECIMALS;
}

export function movementReceipt(movement: Movement, t: MovementTexts): ReceiptData {
  return {
    kind:
      movement.kind === 'swap'
        ? 'swapped'
        : movement.kind === 'payment' && movement.direction === 'sent'
          ? 'paid'
          : movement.direction,
    amount: BigInt(movement.amount),
    currency: movement.currency,
    decimals: decimalsOf(movement),
    counterparty: movement.counterparty_username
      ? `@${movement.counterparty_username}`
      : movement.counterparty,
    reference: presentMovement(movement, t).detail,
    hash: movement.transaction_hash,
    networkId: movement.network,
    date: movement.timestamp * 1000,
  };
}
