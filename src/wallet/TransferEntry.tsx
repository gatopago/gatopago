'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { BrowserAuth } from '../auth/browser';
import type { AccountChoice, BalanceView } from './balances';
import { reloadPage } from '../pwa/reload-guard';
import { TransferEntryStore } from './transfer-entry-store';
import { TransferForm } from './TransferForm';
import { TransferRestoration } from './TransferRestoration';
import type { parseTransferStatus } from './transfers';
import {
  parseTransferBookmark,
  subscribeTransferBookmark,
  transferBookmarkSnapshot,
  transferBookmarkServerSnapshot,
} from './transfer-bookmark';

type Props = {
  runtime: BrowserAuth;
  uid: string;
  account: AccountChoice;
  balance: BalanceView | null;
  english: boolean;
  onReconciled?: (status: ReturnType<typeof parseTransferStatus>) => void;
};
export function TransferEntry(props: Props) {
  return <OwnedTransferEntry key={JSON.stringify([props.uid, props.account])} {...props} />;
}
function OwnedTransferEntry({ runtime, uid, account, balance, english: en, onReconciled }: Props) {
  const [store] = useState(
    () => new TransferEntryStore(() => runtime.accountContexts(uid), account),
  );
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot),
    mounted = useRef(false);
  const hash = useSyncExternalStore(
    subscribeTransferBookmark,
    transferBookmarkSnapshot,
    transferBookmarkServerSnapshot,
  );
  const bookmark = useMemo(() => {
    try {
      return parseTransferBookmark(hash);
    } catch {
      return 'invalid' as const;
    }
  }, [hash]);
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = runtime.subscribe((identity) => {
      if (identity?.uid !== uid) store.invalidate();
      else store.checkSession();
    });
    return () => {
      mounted.current = false;
      unsubscribe();
      // StrictMode setup replay is not a real unmount; opening stays inert until a click.
      queueMicrotask(() => {
        if (!mounted.current) store.dispose();
      });
    };
  }, [runtime, uid, store]);
  useEffect(() => {
    // Restore the existing editor with GETs only. The bookmark cannot authorize
    // sending and is never used as a balance, identity or deployment assertion.
    if (
      bookmark &&
      bookmark !== 'invalid' &&
      bookmark.wallet_id === account.wallet_id &&
      bookmark.wallet_account_id === account.id &&
      bookmark.network_id === account.network_id &&
      state.phase === 'idle'
    )
      void store.open(null, bookmark);
  }, [bookmark, account, state.phase, store]);
  if (state.phase === 'closed')
    return (
      <p role="alert">
        {en
          ? 'Your session changed. Reopen this account.'
          : 'Tu sesión cambió. Vuelve a abrir esta cuenta.'}
      </p>
    );
  if (state.form?.bookmark)
    return (
      <TransferRestoration
        key={JSON.stringify([uid, state.form.selected, state.form.bookmark])}
        runtime={runtime}
        uid={uid}
        selected={state.form.selected}
        bookmark={state.form.bookmark}
        environment={state.form.environment}
        english={en}
        onReconciled={onReconciled}
        onClosed={() => store.finishRestoration()}
      />
    );
  if (state.form?.balance)
    return (
      <TransferForm
        runtime={runtime}
        uid={uid}
        selected={state.form.selected}
        balance={state.form.balance}
        environment={state.form.environment}
        english={en}
        onReconciled={onReconciled}
      />
    );
  return (
    <section aria-busy={state.phase === 'loading'}>
      <button
        className="auth-primary btn btn-primary btn-block"
        type="button"
        disabled={bookmark === 'invalid' || (!balance && !bookmark) || state.phase === 'loading'}
        onClick={() =>
          void store.open(
            bookmark && bookmark !== 'invalid' ? null : balance,
            bookmark && bookmark !== 'invalid' ? bookmark : undefined,
          )
        }
      >
        {state.phase === 'loading'
          ? en
            ? 'Checking account…'
            : 'Verificando cuenta…'
          : bookmark
            ? en
              ? 'Recover this transfer'
              : 'Recuperar este envío'
            : en
              ? 'Send'
              : 'Enviar'}
      </button>
      {!balance && !bookmark ? (
        <p>
          {en
            ? 'Refresh the balance to start a transfer.'
            : 'Actualiza el saldo para comenzar un envío.'}
        </p>
      ) : null}
      {bookmark === 'invalid' ? (
        <p role="alert">
          {en
            ? 'The saved transfer reference is invalid. Do not repeat an unresolved transfer.'
            : 'La referencia guardada del envío no es válida. No repitas un envío pendiente.'}
        </p>
      ) : null}
      {state.phase === 'error' ? (
        <p role="alert">
          {bookmark
            ? en
              ? 'We could not recover this account. Do not repeat the transfer.'
              : 'No pudimos recuperar esta cuenta. No repitas el envío.'
            : en
              ? 'We could not verify this account for transfer preparation. No funds were sent.'
              : 'No pudimos verificar esta cuenta para preparar un envío. No se enviaron fondos.'}
        </p>
      ) : null}
      {state.error === 'client/update-required' ? (
        <button type="button" onClick={() => reloadPage()}>
          {en ? 'Update app' : 'Actualizar app'}
        </button>
      ) : null}
    </section>
  );
}
