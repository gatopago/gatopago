'use client';

import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { BalanceCard } from '../consumer/BalanceCard';
import type { BrowserAuth } from '../auth/browser';
import { BalanceStore } from './balance-store';
import { creationFeeUnit } from './creation-fee';
import { reloadPage, isReloadBlocked, subscribeReloadGuard, serverReloadBlocked } from '../pwa/reload-guard';
import { TransferProgress } from './TransferProgress';

const TransferEntry = dynamic(() => import('./TransferEntry').then(module => module.TransferEntry));

export function WalletBalances({ runtime, uid, walletId, english: en, mode = 'balance' }: {
  runtime: BrowserAuth; uid: string; walletId: string; english: boolean; mode?: 'balance' | 'send' | 'activity';
}) {
  const [store] = useState(() => new BalanceStore(() => runtime.balances(uid), walletId));
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  const monetaryBusy = useSyncExternalStore(subscribeReloadGuard, isReloadBlocked, serverReloadBlocked);
  const heading = useId(), selector = useId();
  useEffect(() => {
    void store.open();
    const unsubscribe = runtime.subscribe((identity) => { if (identity?.uid !== uid) store.invalidate(); else store.checkSession(); });
    const check = () => store.expire();
    window.addEventListener('focus', check); document.addEventListener('visibilitychange', check);
    return () => { unsubscribe(); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); store.dispose(); };
  }, [store, runtime, uid]);
  const busy = state.phase === 'loading';
  return <section aria-labelledby={heading} aria-busy={busy}>
    <h4 id={heading}>{en ? 'Balance by network' : 'Saldo por red'}</h4>
    {state.phase === 'closed' ? <p role="alert">{en ? 'Your session changed. Sign in again to check balances.' : 'Tu sesión cambió. Vuelve a entrar para consultar el saldo.'}</p> : <>
      <button type="button" className="auth-secondary btn btn-ghost btn-block" disabled={busy || monetaryBusy} onClick={() => { if (!isReloadBlocked()) void store.open(); }}>
        {en ? 'Refresh networks' : 'Actualizar redes'}</button>
      {busy ? <p role="status">{en ? 'Checking…' : 'Consultando…'}</p> : null}
      {state.page ? <>
        {state.page.data.length ? <label htmlFor={selector}>{en ? 'Account and network' : 'Cuenta y red'}
          <select id={selector} disabled={monetaryBusy} value={state.selected?.id ?? ''} onChange={(event) => { if (!isReloadBlocked()) void store.select(event.target.value); }}>
            <option value="">{en ? 'Choose a network' : 'Elige una red'}</option>
            {state.page.data.map((account) => <option key={account.id} value={account.id}>
              {creationFeeUnit(account.network_id)?.network ?? account.network_id} · {account.id.slice(-8)}</option>)}
          </select>
        </label> : <p>{en ? 'No network accounts were found on this page.' : 'No hay cuentas de red en esta página.'}</p>}
        {state.page.next_cursor ? <button type="button" disabled={busy || monetaryBusy} onClick={() => { if (!isReloadBlocked()) void store.loadAccounts(state.page!.next_cursor); }}>
          {en ? 'Next accounts' : 'Siguientes cuentas'}</button> : null}
      </> : null}
      {state.phase === 'error' ? <div role="alert"><p>{en ? 'We could not check this balance. This does not mean it is zero.'
        : 'No pudimos consultar este saldo. Esto no significa que sea cero.'}</p>
        {state.error === 'client/update-required' ? <button type="button" onClick={() => reloadPage()}>{en ? 'Update app' : 'Actualizar app'}</button> : null}</div> : null}
      {state.phase === 'expired' ? <p role="status">{en ? 'This balance observation expired. Refresh to check again.' : 'Esta observación del saldo venció. Actualiza para volver a consultar.'}</p> : null}
      <BalanceCard balance={state.balance} network={state.selected ? creationFeeUnit(state.selected.network_id)?.network ?? state.selected.network_id : (en ? 'Choose a network' : 'Elige una red')} english={en} />
      {state.selected ? <button type="button" className="auth-secondary btn btn-ghost btn-block" disabled={busy} onClick={() => void store.refresh()}>
        {en ? 'Refresh balance' : 'Actualizar saldo'}</button> : null}
      <p>{en ? 'This is an observed onchain balance, not an available-to-spend quote. Receiving and sending still require their own checks.'
        : 'Es un saldo observado en red, no una cotización disponible para gastar. Recibir y enviar requieren sus propias comprobaciones.'}</p>
      {state.selected && mode === 'send' ? <TransferEntry key={`${uid}:${state.selected.wallet_id}:${state.selected.id}`}
        runtime={runtime} uid={uid} account={state.selected} balance={state.balance} english={en} onReconciled={store.refreshAfterTransfer}/> : null}
      {state.selected && mode === 'activity' ? <TransferProgress key={`${uid}:${state.selected.wallet_id}:${state.selected.id}`}
        runtime={runtime} uid={uid} account={state.selected} english={en} onReconciled={store.refreshAfterTransfer} /> : null}
    </>}
  </section>;
}
