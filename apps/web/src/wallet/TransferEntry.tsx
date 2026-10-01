'use client';

import { useEffect,useRef,useState,useSyncExternalStore } from 'react';
import type { BrowserAuth } from '../auth/browser';
import type { AccountChoice,BalanceView } from './balances';
import { reloadPage } from '../pwa/reload-guard';
import { TransferEntryStore } from './transfer-entry-store';
import { TransferForm } from './TransferForm';

type Props = { runtime:BrowserAuth; uid:string; account:AccountChoice; balance:BalanceView|null; english:boolean };
export function TransferEntry(props:Props) {
 return <OwnedTransferEntry key={JSON.stringify([props.uid,props.account])} {...props}/>;
}
function OwnedTransferEntry({ runtime,uid,account,balance,english:en }:Props) {
 const [store] = useState(() => new TransferEntryStore(() => runtime.accountContexts(uid),account));
 const state = useSyncExternalStore(store.subscribe,store.snapshot,store.snapshot), mounted = useRef(false);
 useEffect(() => {
  mounted.current = true;
  const unsubscribe = runtime.subscribe(identity => { if (identity?.uid !== uid) store.invalidate(); else store.checkSession(); });
  return () => {
   mounted.current = false; unsubscribe();
   // StrictMode setup replay is not a real unmount; opening stays inert until a click.
   queueMicrotask(() => { if (!mounted.current) store.dispose(); });
  };
 },[runtime,uid,store]);
 if (state.phase === 'closed') return <p role="alert">{en ? 'Your session changed. Reopen this account.' : 'Tu sesión cambió. Vuelve a abrir esta cuenta.'}</p>;
 if (state.form) return <TransferForm runtime={runtime} uid={uid} selected={state.form.selected} balance={state.form.balance}
  environment={state.form.environment} english={en}/>;
 return <section aria-busy={state.phase === 'loading'}>
  <button className="auth-primary" type="button" disabled={!balance || state.phase === 'loading'} onClick={() => void store.open(balance)}>
   {state.phase === 'loading' ? (en ? 'Checking account…' : 'Verificando cuenta…') : (en ? 'Send' : 'Enviar')}</button>
  {!balance ? <p>{en ? 'Refresh the balance to start a transfer.' : 'Actualiza el saldo para comenzar un envío.'}</p> : null}
  {state.phase === 'error' ? <p role="alert">{en ? 'We could not verify this account for transfer preparation. No funds were sent.' : 'No pudimos verificar esta cuenta para preparar un envío. No se enviaron fondos.'}</p> : null}
  {state.error === 'client/update-required' ? <button type="button" onClick={() => reloadPage()}>{en ? 'Update app' : 'Actualizar app'}</button> : null}
 </section>;
}
