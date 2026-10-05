'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Address, Hex } from 'viem';
import type { ReceiptData } from '../consumer/PaymentSheets';
import type { ClientSettings } from '../lib/settings';
import { USDC_DECIMALS } from './account';
import { api } from './api';
import { failureMessage } from './messages';
import { onMovement } from './push';
import type { Session } from './session';

/** A USDC movement of the account, as Wallet Core indexes it from the chain. */
export interface Movement {
  id: string;
  network: string;
  transaction_hash: Hex;
  /** Seconds since the epoch. */
  timestamp: number;
  direction: 'sent' | 'received';
  kind: 'transfer' | 'crosschain' | 'payment' | 'earn' | 'swap';
  currency: string;
  /** Atomic units. */
  amount: string;
  counterparty: Address | null;
  counterparty_username: string | null;
  counterparty_display_name: string | null;
}

/** The account's movements, newest first, a page at a time. */
export function useActivity(settings: ClientSettings, session: Session, en: boolean) {
  const [movements, setMovements] = useState<Movement[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  // A movement notification reads the first page again.
  const [revision, setRevision] = useState(0);
  useEffect(() => onMovement(() => setRevision((value) => value + 1)), []);

  const page = useCallback(
    (before: string | null, signal?: AbortSignal) =>
      api<{ activity: Movement[]; next_cursor: string | null }>(
        settings.apiOrigin,
        before ? `activity?before=${encodeURIComponent(before)}` : 'activity',
        { token: session.token, signal },
      ),
    [settings, session],
  );

  useEffect(() => {
    const controller = new AbortController();
    page(null, controller.signal)
      .then(({ activity, next_cursor }) => {
        setMovements(activity);
        setCursor(next_cursor);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(failureMessage(failure, en));
      });
    return () => controller.abort();
  }, [page, en, revision]);

  function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    page(cursor)
      .then(({ activity, next_cursor }) => {
        setMovements((current) => [...(current ?? []), ...activity]);
        setCursor(next_cursor);
      })
      .catch((failure: unknown) => setError(failureMessage(failure, en)))
      .finally(() => setLoadingMore(false));
  }

  return { movements, hasMore: cursor !== null, loadingMore, loadMore, error };
}

const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

/** V2's row presentation: who first, then what happened. */
export function presentMovement(movement: Movement, en: boolean) {
  const sent = movement.direction === 'sent';
  const identity =
    movement.counterparty_display_name ||
    (movement.counterparty_username ? `@${movement.counterparty_username}` : null);
  if (movement.kind === 'swap')
    return {
      title: en ? 'Token swap' : 'Cambio de tokens',
      detail: en ? 'Asset conversion' : 'Conversión de activos',
      status: en ? 'Completed' : 'Completado',
    };
  if (movement.kind === 'earn')
    return {
      title: 'Aave',
      detail: sent
        ? en
          ? 'Moved into Grow'
          : 'Movido a Crecer'
        : en
          ? 'Withdrawal from Grow'
          : 'Retiro desde Crecer',
      status: en ? 'Completed' : 'Completado',
    };
  const detail =
    movement.kind === 'crosschain'
      ? sent
        ? en
          ? 'Sent to another network'
          : 'Enviado a otra red'
        : en
          ? 'Arrived from another network'
          : 'Llegó desde otra red'
      : movement.kind === 'payment'
        ? sent
          ? en
            ? 'Merchant payment'
            : 'Pago a comercio'
          : en
            ? 'Payment received'
            : 'Cobro recibido'
        : sent
          ? en
            ? 'Payment sent'
            : 'Pago enviado'
          : identity
            ? en
              ? 'Payment received'
              : 'Cobro recibido'
            : en
              ? 'Deposit received'
              : 'Depósito recibido';
  const title =
    identity ??
    (movement.kind === 'crosschain'
      ? en
        ? 'Between networks'
        : 'Entre redes'
      : movement.counterparty
        ? `Wallet ${shortAddress(movement.counterparty)}`
        : 'GatoPago');
  return { title, detail, status: en ? 'Completed' : 'Completado' };
}

export function movementReceipt(movement: Movement, en: boolean): ReceiptData {
  return {
    kind: movement.kind === 'swap' ? 'swapped' : movement.direction,
    amount: BigInt(movement.amount),
    currency: movement.currency,
    decimals: USDC_DECIMALS,
    counterparty: movement.counterparty_username
      ? `@${movement.counterparty_username}`
      : movement.counterparty,
    reference: presentMovement(movement, en).detail,
    hash: movement.transaction_hash,
    networkId: movement.network,
    date: movement.timestamp * 1000,
  };
}
