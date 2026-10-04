'use client';

import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import type { BrowserAuth } from '../auth/browser';
import type { AccountChoice } from './balances';
import { TransferStore } from './transfer-store';
import type { parseTransferStatus } from './transfers';

export function TransferProgress({
  runtime,
  uid,
  account,
  english: en,
  onReconciled,
}: {
  runtime: Pick<BrowserAuth, 'transfers' | 'subscribe'>;
  uid: string;
  account: AccountChoice;
  english: boolean;
  onReconciled?: (status: ReturnType<typeof parseTransferStatus>) => void;
}) {
  const [store] = useState(() => new TransferStore(() => runtime.transfers(uid)));
  const [reference, setReference] = useState('');
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  const heading = useId(),
    field = useId();
  useEffect(() => {
    const unsubscribe = runtime.subscribe((identity) => {
      if (identity?.uid !== uid) store.invalidate();
    });
    return () => {
      unsubscribe();
      store.dispose();
    };
  }, [runtime, uid, store]);
  useEffect(() => {
    if (state.result?.status === 'reconciled') onReconciled?.(state.result);
  }, [state.result, onReconciled]);
  const result = state.result,
    busy = state.phase === 'loading',
    closed = state.phase === 'closed';
  const title =
    result?.status === 'review_required'
      ? en
        ? 'This transfer needs review'
        : 'Este envío requiere revisión'
      : result?.status === 'reconciled'
        ? en
          ? 'Balance reconciled; reservation released'
          : 'Saldo reconciliado; reserva liberada'
        : result?.status === 'confirmation_recorded'
          ? en
            ? 'Confirmation recorded'
            : 'Confirmación registrada'
          : result?.status === 'expired'
            ? en
              ? 'Sending window expired'
              : 'Venció el plazo de envío'
            : result?.status === 'held'
              ? en
                ? 'Reserved; awaiting delivery'
                : 'Reservado; esperando entrega'
              : en
                ? 'Transfer pending'
                : 'Envío pendiente';
  return (
    <section aria-labelledby={heading} aria-busy={busy}>
      <h4 id={heading}>{en ? 'Track a transfer' : 'Consultar un envío'}</h4>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void store.read({
            wallet_id: account.wallet_id,
            wallet_account_id: account.id,
            network_id: account.network_id,
            operation_id: reference.trim(),
          });
        }}
      >
        <label htmlFor={field}>{en ? 'Transfer reference' : 'Referencia del envío'}</label>
        <input
          id={field}
          value={reference}
          maxLength={39}
          autoComplete="off"
          spellCheck={false}
          disabled={closed}
          onChange={(event) => {
            store.clear();
            setReference(event.target.value);
          }}
        />
        <button
          type="submit"
          className="auth-secondary btn btn-ghost btn-block"
          disabled={closed || busy || !/^op_[0-9a-f-]{36}$/.test(reference.trim())}
        >
          {busy ? (en ? 'Checking…' : 'Consultando…') : en ? 'Check status' : 'Consultar estado'}
        </button>
      </form>
      {closed ? (
        <p role="alert">
          {en ? 'Your session changed. Sign in again.' : 'Tu sesión cambió. Vuelve a entrar.'}
        </p>
      ) : null}
      {state.phase === 'error' ? (
        <p role="alert">
          {en
            ? 'We could not read this transfer. Do not assume it failed or send it again.'
            : 'No pudimos consultar este envío. No supongas que falló ni lo envíes otra vez.'}
        </p>
      ) : null}
      {result ? (
        <div role="status">
          <h5>{title}</h5>
          {result.historical_confirmation ? (
            <>
              <p>
                {result.historical_confirmation.outcome === 'execution_reverted'
                  ? en
                    ? 'Execution reverted; fees may still have been charged.'
                    : 'La ejecución revirtió; puede haber consumido comisiones de red.'
                  : en
                    ? 'Execution evidence was recorded.'
                    : 'Se registró evidencia de ejecución.'}
              </p>
              <details>
                <summary>{en ? 'Transaction reference' : 'Referencia de transacción'}</summary>
                <code style={{ overflowWrap: 'anywhere' }}>
                  {result.historical_confirmation.transaction_hash}
                </code>
              </details>
            </>
          ) : null}
          {result.funds_reserved ? (
            <p>
              {en
                ? 'Funds remain reserved while reconciliation is pending.'
                : 'Los fondos siguen reservados mientras se completa la reconciliación.'}
            </p>
          ) : null}
          {result.status === 'review_required' ? (
            <p>
              {en
                ? 'Conflicting evidence was recorded. Do not create a replacement transfer.'
                : 'Se registró evidencia contradictoria. No crees otro envío para reemplazar éste.'}
            </p>
          ) : null}
        </div>
      ) : null}
      <p>
        {en ? 'Checking does not sign or resend anything.' : 'Consultar no firma ni reenvía nada.'}
      </p>
    </section>
  );
}
