'use client';

import { useEffect, useRef, useState } from 'react';
import type { BrowserAuth } from '../auth/browser';
import { WalletCoreError, type WalletPage } from './core';
import { reloadPage } from '../pwa/reload-guard';
import { WalletBalances } from './WalletBalances';
import { NavigationLink } from '../consumer/NavigationLink';
import { localizedPath } from '../consumer/routes';

type State = { phase: 'loading' } | { phase: 'ready'; page: WalletPage } | { phase: 'error'; code: string };

/** Parent keys this component by Firebase UID. No data survives a change of identity. */
export function WalletOverview({ runtime, uid, english: en, mode = 'balance' }: { runtime: BrowserAuth; uid: string; english: boolean; mode?: 'balance' | 'send' | 'activity' }) {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [revision, setRevision] = useState(0);
  const [moreError, setMoreError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const active = useRef<AbortController | null>(null);
  const morePending = useRef(false);
  useEffect(() => {
    const controller = new AbortController(); active.current = controller;
    void runtime.wallets(uid, controller.signal).then((page) => {
      if (!controller.signal.aborted) setState({ phase: 'ready', page });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({ phase: 'error', code: error instanceof WalletCoreError ? error.code : 'wallet/unavailable' });
    });
    return () => { controller.abort(); active.current?.abort(); };
  }, [runtime, uid, revision]);

  async function more() {
    if (state.phase !== 'ready' || !state.page.next_cursor || morePending.current) return;
    // Ref protects against two click handlers before React commits the loading state.
    morePending.current = true;
    if (active.current && !active.current.signal.aborted) active.current.abort();
    const controller = new AbortController(); active.current = controller;
    const previous = state.page;
    setLoadingMore(true); setMoreError(false);
    try {
      const next = await runtime.wallets(uid, controller.signal, previous.next_cursor);
      if (!controller.signal.aborted) {
        if (previous.data.some((wallet) => next.data.some((item) => item.id === wallet.id || item.user_id !== wallet.user_id))) throw new Error('Inconsistent wallet page');
        setState({ phase: 'ready', page: { data: [...previous.data, ...next.data], next_cursor: next.next_cursor } });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        if (error instanceof WalletCoreError && error.code !== 'wallet/unavailable') setState({ phase: 'error', code: error.code });
        else setMoreError(true);
      }
    } finally { morePending.current = false; if (!controller.signal.aborted) setLoadingMore(false); }
  }
  if (state.phase === 'loading') return <p role="status">{en ? 'Checking your wallets…' : 'Consultando tus wallets…'}</p>;
  if (state.phase === 'error') {
    const reauth = state.code === 'auth/unauthenticated' || state.code === 'auth/session-changed';
    const update = state.code === 'client/update-required';
    return <div className="auth-error" role="alert">
      <p>{update ? (en ? 'Update GatoPago to continue.' : 'Actualiza GatoPago para continuar.') : reauth
        ? (en ? 'Your session could not be validated. Sign out and sign in again.' : 'No se pudo validar tu sesión. Cierra sesión y vuelve a entrar.')
        : (en ? 'We could not check your wallets. This does not mean your account was deleted.' : 'No pudimos consultar tus wallets. Esto no significa que tu cuenta se haya eliminado.')}</p>
      {update ? <button type="button" onClick={() => reloadPage()}>{en ? 'Reload' : 'Recargar'}</button> : !reauth
        ? <button type="button" onClick={() => { setState({ phase: 'loading' }); setRevision((value) => value + 1); }}>{en ? 'Try again' : 'Reintentar'}</button> : null}
    </div>;
  }
  return <div>
    {state.page.data.length === 0 ? <><p>{en ? 'Your access is ready. Finish creating your wallet to continue.' : 'Tu acceso está listo. Termina de crear tu wallet para continuar.'}</p>
      <NavigationLink href={localizedPath('/onboarding', en)} className="auth-primary btn btn-primary btn-block">{en ? 'Continue wallet setup' : 'Continuar creación de wallet'}</NavigationLink></>
      : <ul>{state.page.data.map((wallet, index) => <li key={wallet.id}>{en ? 'Account' : 'Cuenta'} {index + 1}{wallet.status === 'archived' ? (en ? ' — archived' : ' — archivada') : ''}
        {wallet.status === 'active' ? <WalletBalances key={`${uid}:${wallet.id}:${mode}`} runtime={runtime} uid={uid} walletId={wallet.id} english={en} mode={mode} /> : null}
      </li>)}</ul>}
    {moreError ? <p role="alert">{en ? 'The next page could not be loaded.' : 'No se pudo cargar la siguiente página.'}</p> : null}
    {state.page.next_cursor ? <button className="auth-secondary btn btn-ghost btn-block" type="button" disabled={loadingMore} onClick={() => void more()}>
      {loadingMore ? (en ? 'Loading…' : 'Cargando…') : (en ? 'Show more' : 'Mostrar más')}</button> : null}
  </div>;
}
