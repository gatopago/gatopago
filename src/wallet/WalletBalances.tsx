'use client';

import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { BalanceCard } from '../consumer/BalanceCard';
import type { BrowserAuth } from '../auth/browser';
import { BalanceStore } from './balance-store';
import { creationFeeUnit } from './creation-fee';
import {
  reloadPage,
  isReloadBlocked,
  subscribeReloadGuard,
  serverReloadBlocked,
} from '../pwa/reload-guard';
import { TransferProgress } from './TransferProgress';

const TransferEntry = dynamic(() =>
  import('./WalletFundingEntry').then((module) => module.WalletFundingEntry),
);
const Money = dynamic(() => import('./WalletMoney').then((module) => module.WalletMoney));

export function WalletBalances({
  runtime,
  uid,
  walletId,
  english: en,
  mode = 'balance',
}: {
  runtime: BrowserAuth;
  uid: string;
  walletId: string;
  english: boolean;
  mode?: 'balance' | 'send' | 'activity' | 'grow';
}) {
  const [store] = useState(() => new BalanceStore(() => runtime.balances(uid), walletId));
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  const monetaryBusy = useSyncExternalStore(
    subscribeReloadGuard,
    isReloadBlocked,
    serverReloadBlocked,
  );
  const heading = useId(),
    selector = useId();
  useEffect(() => {
    void store.open();
    const unsubscribe = runtime.subscribe((identity) => {
      if (identity?.uid !== uid) store.invalidate();
      else store.checkSession();
    });
    const check = () => store.expire();
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
      store.dispose();
    };
  }, [store, runtime, uid]);
  const busy = state.phase === 'loading';
  return (
    <section aria-labelledby={heading} aria-busy={busy}>
      <h2 id={heading} className="sr-only">
        {en ? 'Account balance' : 'Saldo de tu cuenta'}
      </h2>
      {state.phase === 'closed' ? (
        <p role="alert">
          {en
            ? 'Your session changed. Sign in again to check balances.'
            : 'Tu sesión cambió. Vuelve a entrar para consultar el saldo.'}
        </p>
      ) : (
        <>
          {busy ? <p role="status">{en ? 'Checking…' : 'Consultando…'}</p> : null}
          {state.page ? (
            <>
              {state.page.data.length > 1 ? (
                <label className="mb-4 block text-sm" htmlFor={selector}>
                  {en ? 'Network' : 'Red'}
                  <select
                    id={selector}
                    disabled={monetaryBusy}
                    value={state.selected?.id ?? ''}
                    onChange={(event) => {
                      if (!isReloadBlocked()) void store.select(event.target.value);
                    }}
                  >
                    <option value="">{en ? 'Choose a network' : 'Elige una red'}</option>
                    {state.page.data.map((account) => (
                      <option key={account.id} value={account.id}>
                        {creationFeeUnit(account.network_id)?.network ?? account.network_id} ·{' '}
                        {account.id.slice(-8)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : state.page.data.length === 0 ? (
                <p>
                  {en
                    ? 'Your account is not active on a network yet.'
                    : 'Tu cuenta todavía no está activa en una red.'}
                </p>
              ) : null}
              {state.page.next_cursor ? (
                <button
                  type="button"
                  disabled={busy || monetaryBusy}
                  onClick={() => {
                    if (!isReloadBlocked()) void store.loadAccounts(state.page!.next_cursor);
                  }}
                >
                  {en ? 'Next accounts' : 'Siguientes cuentas'}
                </button>
              ) : null}
            </>
          ) : null}
          {state.phase === 'error' ? (
            <div role="alert">
              <p>
                {en
                  ? 'We could not check this balance. This does not mean it is zero.'
                  : 'No pudimos consultar este saldo. Esto no significa que sea cero.'}
              </p>
              {state.error === 'client/update-required' ? (
                <button type="button" onClick={() => reloadPage()}>
                  {en ? 'Update app' : 'Actualizar app'}
                </button>
              ) : null}
            </div>
          ) : null}
          {state.phase === 'expired' ? (
            <p role="status">
              {en
                ? 'This balance observation expired. Refresh to check again.'
                : 'Esta observación del saldo venció. Actualiza para volver a consultar.'}
            </p>
          ) : null}
          <BalanceCard
            balance={state.balance}
            network={
              state.selected
                ? (creationFeeUnit(state.selected.network_id)?.network ?? state.selected.network_id)
                : en
                  ? 'Choose a network'
                  : 'Elige una red'
            }
            english={en}
          />
          {state.selected ? (
            <button
              type="button"
              className="mx-auto mb-5 block min-h-11 text-[12px] text-text-muted underline underline-offset-4"
              disabled={busy || monetaryBusy}
              onClick={() => {
                if (!isReloadBlocked()) void store.refresh();
              }}
            >
              {en ? 'Refresh balance' : 'Actualizar saldo'}
            </button>
          ) : null}
          {!state.selected && !busy ? (
            <button
              type="button"
              className="btn btn-ghost btn-block"
              disabled={monetaryBusy}
              onClick={() => {
                if (!isReloadBlocked()) void store.open();
              }}
            >
              {en ? 'Try again' : 'Reintentar'}
            </button>
          ) : null}
          {state.selected && mode === 'send' ? (
            <TransferEntry
              key={`${uid}:${state.selected.wallet_id}:${state.selected.id}`}
              runtime={runtime}
              uid={uid}
              account={state.selected}
              balance={state.balance}
              english={en}
              onReconciled={store.refreshAfterTransfer}
            />
          ) : null}
          {state.selected && mode === 'activity' ? (
            <TransferProgress
              key={`${uid}:${state.selected.wallet_id}:${state.selected.id}`}
              runtime={runtime}
              uid={uid}
              account={state.selected}
              english={en}
              onReconciled={store.refreshAfterTransfer}
            />
          ) : null}
          {state.selected && mode === 'grow' ? (
            <Money runtime={runtime} uid={uid} account={state.selected} english={en} mode="grow" />
          ) : null}
        </>
      )}
    </section>
  );
}
