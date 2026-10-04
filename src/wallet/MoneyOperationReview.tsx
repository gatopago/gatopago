'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import type { CredentialDetail } from '@gatopago/shared/v3/credential-detail';
import { atomicToDecimal } from '@gatopago/shared/v3/amount';
import { SignerKind } from '@gatopago/shared/v3/security-policy';
import type { BrowserAuth } from '../auth/browser';
import { SpendSigning } from './transfer-signing';
import { requestPasskeyProof } from './passkeys';
import type { MoneyPreparation } from './money';
import type { MoneySelection } from './money-release';
import { MoneyExecutionFlow } from './money-execution-flow';
import { saveMoneyBookmark, clearMoneyBookmark } from './money-bookmark';
import { MoneyOperationReceipt } from './MoneyOperationReceipt';
import { holdPageReload } from '../pwa/reload-guard';

type Props = {
  runtime: BrowserAuth;
  uid: string;
  session: Awaited<ReturnType<BrowserAuth['money']>>;
  selected: MoneySelection;
  preparation: MoneyPreparation;
  credentials: readonly CredentialDetail[];
  english: boolean;
  restored?: boolean;
  onClose: () => void;
};
export function MoneyOperationReview(props: Props) {
  return (
    <ReviewedMoney
      key={JSON.stringify([
        props.uid,
        props.selected,
        props.preparation.wire,
        props.credentials,
        props.restored,
      ])}
      {...props}
    />
  );
}
function ReviewedMoney({
  runtime,
  uid,
  session,
  selected,
  preparation,
  credentials,
  english: en,
  restored = false,
  onClose,
}: Props) {
  const [bound] = useState(() => {
    const flow = new MoneyExecutionFlow(
      session,
      selected,
      preparation,
      saveMoneyBookmark,
      restored,
    );
    const signing = new SpendSigning(
      preparation,
      credentials,
      session.assertCurrent,
      requestPasskeyProof,
    );
    return { flow, signing };
  });
  const state = useSyncExternalStore(
    bound.flow.subscribe,
    bound.flow.snapshot,
    bound.flow.snapshot,
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false),
    [signed, setSigned] = useState<number[]>([]),
    [expired, setExpired] = useState(false);
  const mounted = useRef(false),
    inFlight = useRef(false),
    heading = useId();
  useEffect(() => {
    mounted.current = true;
    const invalidate = () => {
      bound.signing.dispose();
      bound.flow.invalidate();
    };
    const unsubscribe = runtime.subscribe((identity) => {
      try {
        if (identity?.uid !== uid) throw new Error('session changed');
        session.assertCurrent();
      } catch {
        invalidate();
      }
    });
    const timer = setTimeout(
      () => {
        setExpired(true);
        bound.signing.dispose();
      },
      Math.max(0, preparation.expires_at * 1000 - Date.now()),
    );
    return () => {
      mounted.current = false;
      clearTimeout(timer);
      unsubscribe();
      queueMicrotask(() => {
        if (!mounted.current) invalidate();
      });
    };
  }, [bound, runtime, uid, session, preparation.expires_at]);
  useEffect(() => {
    if (restored) void bound.flow.readStatus();
  }, [bound, restored]);
  useEffect(() => {
    if (!bound.flow.canTrack()) return;
    const read = () => {
      if (document.visibilityState === 'visible') void bound.flow.readStatus();
    };
    const timer = setTimeout(read, 5_000);
    document.addEventListener('visibilitychange', read);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', read);
    };
  }, [bound, state]);
  function run(action: () => Promise<unknown>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(false);
    // Invoke in the click stack, before imports, HTTP or token refresh.
    void action()
      .catch(() => {
        if (mounted.current) setError(true);
      })
      .finally(() => {
        inFlight.current = false;
        if (mounted.current) {
          setSigned(bound.signing.signedIndices());
          setBusy(false);
        }
      });
  }
  const c = preparation.candidate,
    kind = c.request.kind,
    fresh = !expired;
  const choices = bound.signing.choices();
  const singleKey =
    preparation.review.policy.spendThreshold === 1 &&
    choices.length === 1 &&
    choices[0].kind === SignerKind.WEBAUTHN &&
    choices[0].credential_refs.length === 1
      ? choices[0]
      : null;
  const actionLabel =
    kind === 'aave_supply'
      ? en
        ? 'Deposit'
        : 'Depositar'
      : kind === 'aave_withdraw'
        ? en
          ? 'Withdraw'
          : 'Retirar'
        : en
          ? 'Pay'
          : 'Pagar';
  const title =
    kind === 'aave_supply'
      ? en
        ? 'Deposit into Aave'
        : 'Depositar en Aave'
      : kind === 'aave_withdraw'
        ? en
          ? 'Withdraw from Aave'
          : 'Retirar de Aave'
        : en
          ? 'Pay from your Aave position'
          : 'Pagar desde tu posición Aave';
  if (state.phase === 'closed')
    return (
      <p role="alert">
        {en
          ? 'Your session changed. Reopen this account.'
          : 'Tu sesión cambió. Vuelve a abrir esta cuenta.'}
      </p>
    );
  return (
    <section className="money-panel" aria-labelledby={heading} aria-busy={busy}>
      <h3 id={heading}>{title}</h3>
      <dl>
        <dt>{en ? 'Amount' : 'Importe'}</dt>
        <dd>{atomicToDecimal(c.request.amount_atomic, 6)} USDC</dd>
        {c.request.recipient_address ? (
          <>
            <dt>{en ? 'Recipient' : 'Destinatario'}</dt>
            <dd className="break-all font-mono text-xs">{c.request.recipient_address}</dd>
          </>
        ) : null}
        <dt>{en ? 'Network' : 'Red'}</dt>
        <dd>Arbitrum Sepolia · {en ? 'testnet' : 'red de prueba'}</dd>
        <dt>{en ? 'Maximum network cost' : 'Coste máximo de red'}</dt>
        <dd>{atomicToDecimal(c.funding.maximum_native_gas_atomic, 18)} ETH</dd>
        <dt>{en ? 'Platform fee' : 'Comisión de plataforma'}</dt>
        <dd>0 USDC</dd>
      </dl>
      <ol>
        {kind === 'aave_supply' ? (
          <>
            <li>
              {en
                ? 'Reset the existing USDC approval.'
                : 'Poner a cero la aprobación previa de USDC.'}
            </li>
            <li>
              {en
                ? 'Approve this exact amount and deposit into your own position.'
                : 'Aprobar este importe exacto y depositarlo en tu propia posición.'}
            </li>
            <li>{en ? 'Leave the approval at zero.' : 'Dejar la aprobación en cero.'}</li>
          </>
        ) : (
          <>
            <li>
              {en
                ? 'Withdraw this exact amount into your own account.'
                : 'Retirar este importe exacto a tu propia cuenta.'}
            </li>
            {kind === 'aave_withdraw_and_pay' ? (
              <li>
                {en
                  ? 'Transfer it to the reviewed recipient in the same operation.'
                  : 'Transferirlo al destinatario revisado en la misma operación.'}
              </li>
            ) : null}
          </>
        )}
      </ol>
      <p>
        {en
          ? 'You authorize this one operation. Aave interest and withdrawal liquidity can change.'
          : 'Autorizas sólo esta operación. El interés y la liquidez para retirar en Aave pueden cambiar.'}
      </p>
      {!restored && !singleKey && state.phase === 'review'
        ? choices.map((choice) => (
            <div key={choice.index}>
              {choice.credential_refs.map((reference) => (
                <button
                  className="auth-secondary btn btn-ghost btn-block"
                  type="button"
                  key={reference}
                  disabled={busy || !fresh || signed.includes(choice.index)}
                  onClick={() => run(() => bound.signing.passkey(choice.index, reference))}
                >
                  {signed.includes(choice.index)
                    ? en
                      ? 'Key verified'
                      : 'Llave verificada'
                    : en
                      ? 'Authorize with my key'
                      : 'Autorizar con mi llave'}
                </button>
              ))}
              {choice.credential_refs.length === 0 ? (
                <p>
                  {en
                    ? 'A matching access key is unavailable on this device.'
                    : 'No hay una llave de acceso correspondiente disponible en este dispositivo.'}
                </p>
              ) : null}
            </div>
          ))
        : null}
      {!restored && state.phase === 'review' ? (
        <button
          className="auth-primary btn btn-primary btn-block"
          type="button"
          disabled={
            busy ||
            !fresh ||
            (!singleKey && signed.length < preparation.review.policy.spendThreshold)
          }
          onClick={() =>
            run(async () => {
              const release = holdPageReload();
              try {
                if (singleKey)
                  await bound.signing.passkey(singleKey.index, singleKey.credential_refs[0]);
                const proofs = await bound.signing.confirmationProofs();
                await bound.flow.confirm(proofs);
                if (bound.flow.canDeliver()) await bound.flow.deliver();
              } finally {
                release();
              }
            })
          }
        >
          {busy ? (en ? 'Processing…' : 'Procesando…') : actionLabel}
        </button>
      ) : null}
      {bound.flow.canDeliver() ? (
        <button
          className="auth-primary btn btn-primary btn-block"
          type="button"
          disabled={busy || !fresh}
          onClick={() => run(() => bound.flow.deliver())}
        >
          {actionLabel}
        </button>
      ) : null}
      {state.phase !== 'review' ? (
        <button
          className="auth-secondary btn btn-ghost btn-block"
          type="button"
          disabled={busy}
          onClick={() => run(() => bound.flow.readStatus())}
        >
          {en ? 'Check this operation' : 'Consultar esta operación'}
        </button>
      ) : null}
      {error || state.error ? (
        <p role="alert">
          {en
            ? 'This action could not be verified. Check the existing reference before repeating anything.'
            : 'No se pudo verificar esta acción. Consulta la referencia existente antes de repetir algo.'}
        </p>
      ) : null}
      {!fresh ? (
        <p role="status">
          {en
            ? 'Consent expired. An existing operation still needs its result checked.'
            : 'El consentimiento venció. Una operación existente aún necesita verificar su resultado.'}
        </p>
      ) : null}
      {state.status ? <MoneyOperationReceipt status={state.status} english={en} /> : null}
      <details>
        <summary>{en ? 'Technical details' : 'Detalles técnicos'}</summary>
        <p className="break-all font-mono text-xs">{c.digest}</p>
        <p className="break-all font-mono text-xs">{c.userOpHash}</p>
        <p className="break-all font-mono text-xs">{selected.market.digest}</p>
      </details>
      {bound.flow.canEdit() ? (
        <button
          className="btn btn-ghost btn-block"
          type="button"
          disabled={busy}
          onClick={() => {
            if (inFlight.current) return;
            bound.signing.dispose();
            bound.flow.invalidate();
            onClose();
          }}
        >
          {en ? 'Edit amount' : 'Editar importe'}
        </button>
      ) : null}
      {state.status && !state.status.funds_reserved ? (
        <button
          className="btn btn-ghost btn-block"
          type="button"
          disabled={busy}
          onClick={() => {
            try {
              session.assertCurrent();
              clearMoneyBookmark(bound.flow.bookmark());
              bound.signing.dispose();
              bound.flow.invalidate();
              onClose();
            } catch {
              setError(true);
            }
          }}
        >
          {en ? 'Close receipt' : 'Cerrar comprobante'}
        </button>
      ) : null}
    </section>
  );
}
