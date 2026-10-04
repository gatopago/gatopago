'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import type { CreationConsent } from '@gatopago/shared/v3/creation-operation-wire';
import type { BrowserAuth } from '../auth/browser';
import type { CreationProfilePin } from './creation-release';
import { CreationFlow } from './creation-flow';
import { creationFeeUnit, formatCreationFee } from './creation-fee';
import { requestPasskeyProof } from './passkeys';
import CreationProgress from './CreationProgress';
import { finishRegisteredAccount, profileMessage } from './profile';

function message(code: string, en: boolean) {
  switch (code) {
    case 'auth/session-changed':
    case 'auth/unauthenticated':
    case 'client/update-required':
      return en
        ? 'Your session or app version changed. Reload and sign in before continuing.'
        : 'Tu sesión o versión de la app cambió. Recarga y vuelve a entrar antes de continuar.';
    case 'creation/cap-too-low':
      return en
        ? 'The service could not produce a valid bounded network fee. No creation was authorized.'
        : 'El servicio no pudo calcular una comisión de red acotada y válida. No se autorizó la creación.';
    case 'creation/expired':
      return en
        ? 'The signing window expired, or your device clock is incorrect. You can still read the result; no new operation will be created automatically.'
        : 'El plazo para firmar venció o el reloj del dispositivo es incorrecto. Puedes seguir consultando el resultado; no se creará otra operación automáticamente.';
    case 'cancelled':
      return en
        ? 'Confirmation was cancelled or unavailable. This does not mean your key is missing; recovery was not started.'
        : 'La confirmación se canceló o no estuvo disponible. Esto no significa que falte tu llave; no se inició recuperación.';
    case 'creation/conflict':
    case 'creation/invalid':
    case 'creation/not-found':
      return en
        ? 'The operation could not be verified consistently. Check the same request again; do not send funds based on this screen.'
        : 'No pudimos verificar la operación de forma consistente. Consulta de nuevo la misma solicitud; no envíes fondos basándote en esta pantalla.';
    default:
      return en
        ? 'The result is uncertain. Stopping the wait does not undo a request the server may have received. Read the same operation before continuing.'
        : 'El resultado es incierto. Detener la espera no deshace una solicitud que el servidor pudo recibir. Consulta la misma operación antes de continuar.';
  }
}

export default function CreationOperationPanel({
  runtime,
  uid,
  pin,
  consent,
  knownRecorded,
  english: en,
  onActiveChange,
}: {
  runtime: BrowserAuth;
  uid: string;
  pin: CreationProfilePin;
  consent: CreationConsent;
  knownRecorded: boolean;
  english: boolean;
  onActiveChange: (active: boolean) => void;
}) {
  const [flow] = useState(
    () =>
      new CreationFlow(
        () => runtime.creationOperation(uid, pin),
        requestPasskeyProof,
        pin,
        consent,
        knownRecorded,
      ),
  );
  const state = useSyncExternalStore(flow.subscribe, flow.snapshot, flow.snapshot);
  const unit = creationFeeUnit(state.network);
  const busy = ['loading', 'preparing', 'proving', 'submitting'].includes(state.phase);
  useEffect(() => {
    const unsubscribe = runtime.subscribe((identity) => {
      if (identity?.uid !== uid) flow.invalidate();
      else flow.checkSession();
    });
    // Skip StrictMode's trial mount. Open restores the same request and obtains
    // its fee automatically; it never signs or sends an operation.
    let connected = true;
    queueMicrotask(() => {
      if (connected) void flow.open();
    });
    return () => {
      connected = false;
      unsubscribe();
      flow.dispose();
      onActiveChange(false);
    };
  }, [runtime, uid, flow, onActiveChange]);
  useEffect(() => {
    onActiveChange(busy);
  }, [busy, onActiveChange]);
  useEffect(() => {
    if (
      state.phase !== 'authorized' ||
      state.lifecycle?.bootstrap ||
      state.lifecycle?.job_state === 'review' ||
      state.lifecycle?.job_state === 'complete' ||
      state.receipt?.delivery_state === 'expired'
    )
      return;
    // Read only this operation. Never prepare, authorize or resend from an effect.
    const read = () => {
      if (document.visibilityState === 'visible') void flow.restore();
    };
    const timer = window.setTimeout(read, 5_000);
    document.addEventListener('visibilitychange', read);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', read);
    };
  }, [flow, state]);
  return (
    <section
      className="account-initialization"
      aria-labelledby="creation-operation-heading"
      aria-busy={busy}
    >
      <h2 id="creation-operation-heading">{en ? 'Confirm to finish' : 'Confirma para terminar'}</h2>
      <p>
        {en
          ? 'Review the fee and confirm with your passkey.'
          : 'Revisa la comisión y confirma con tu passkey.'}
      </p>
      {state.error ? (
        <p className="auth-error" role="alert">
          {message(state.error, en)}
        </p>
      ) : null}
      {!unit ? (
        <p role="alert">
          {en
            ? 'This release cannot display and approve fees for this network. Reading remains available.'
            : 'Esta versión no puede mostrar ni aprobar cargos para esta red. Puedes seguir consultando el estado.'}
        </p>
      ) : null}
      {state.phase === 'prepare-retry' && unit ? (
        <>
          <p>
            {en
              ? 'The last read found no operation. Retry only this same creation request; any saved terms will be restored unchanged.'
              : 'La última consulta no encontró una operación. Reintenta sólo esta misma solicitud de creación; si hay condiciones guardadas, se recuperarán sin cambios.'}
          </p>
          <button
            type="button"
            className="auth-primary btn btn-primary btn-block"
            onClick={() => void flow.prepare()}
          >
            {en ? 'Retry the same preparation' : 'Reintentar la misma preparación'}
          </button>
        </>
      ) : null}
      {state.review ? (
        <details
          className="initialization-review"
          open={state.receipt?.state === 'authorized' ? undefined : true}
        >
          <summary>
            {state.receipt?.state === 'authorized'
              ? en
                ? 'Recorded operation details'
                : 'Detalles de la operación registrada'
              : en
                ? 'Review activation'
                : 'Revisa la activación'}
          </summary>
          <p>
            {en
              ? 'This authorizes account activation. It does not send a payment.'
              : 'Esto autoriza la activación de tu cuenta. No envía un pago.'}
          </p>
          {unit ? (
            <>
              <p>
                {en ? 'Maximum network fee' : 'Comisión máxima de red'}:{' '}
                <strong>{formatCreationFee(state.review.maximumCharge, state.network)}</strong>.
              </p>
              <p>
                {en
                  ? 'The amount shown is a maximum. The final network charge depends on execution.'
                  : 'El importe mostrado es un máximo. El cargo final de red depende de la ejecución.'}
              </p>
              <p>
                {state.review.sponsored
                  ? en
                    ? 'Network fee covered by GatoPago. Your account pays no gas for this operation.'
                    : 'GatoPago cubre la comisión de red. Tu cuenta no paga gas por esta operación.'
                  : en
                    ? 'The network fee is paid from your account.'
                    : 'La comisión de red se paga desde tu cuenta.'}
              </p>
            </>
          ) : null}
          <p>
            {en ? 'Signing deadline' : 'Plazo para firmar'}:{' '}
            <time dateTime={new Date(state.review.expiresAt * 1000).toISOString()}>
              {new Date(state.review.expiresAt * 1000).toLocaleString(en ? 'en-US' : 'es-BO')}
            </time>
            .
          </p>
          <details>
            <summary>
              {en ? 'Technical operation details' : 'Detalles técnicos de la operación'}
            </summary>
            <p>
              {en
                ? 'Expected account address — not enabled for deposits'
                : 'Dirección prevista de la cuenta — no habilitada para depósitos'}
              : <code>{state.review.address}</code>
            </p>
            <p>
              UserOperation: <code>{state.review.userOpHash}</code>
            </p>
            <p>
              ExecutionPlan: <code>{state.review.digest}</code>
            </p>
          </details>
        </details>
      ) : null}
      {state.phase === 'ready' && unit ? (
        <button
          type="button"
          className="auth-primary btn btn-primary btn-block"
          onClick={() => void (state.signed ? flow.retryAuthorization() : flow.confirm())}
        >
          {state.signed
            ? en
              ? 'Resend the same authorization, without signing again'
              : 'Reenviar la misma autorización, sin volver a firmar'
            : en
              ? 'Confirm with my passkey'
              : 'Confirmar con mi passkey'}
        </button>
      ) : null}
      {state.receipt?.state === 'authorized' ? (
        <CreationProgress
          lifecycle={state.lifecycle}
          delivery={state.receipt.delivery_state}
          checkedAt={state.checkedAt}
          english={en}
        />
      ) : null}
      {state.receipt?.state === 'authorized' && state.lifecycle?.bootstrap ? (
        <FinishRegistration
          key={uid}
          runtime={runtime}
          uid={uid}
          walletId={state.lifecycle.bootstrap.wallet_id}
          accountId={state.lifecycle.bootstrap.wallet_account_id}
          english={en}
        />
      ) : null}

      {busy ? (
        <>
          <p role="status">
            {state.phase === 'proving'
              ? en
                ? 'Confirm the creation in your browser…'
                : 'Confirma la creación en tu navegador…'
              : state.phase === 'loading'
                ? en
                  ? 'Reading the same operation…'
                  : 'Consultando la misma operación…'
                : en
                  ? 'Checking with GatoPago…'
                  : 'Comprobando con GatoPago…'}
          </p>
          <button
            type="button"
            className="auth-secondary btn btn-ghost btn-block"
            onClick={() => flow.stop()}
          >
            {en ? 'Stop waiting' : 'Detener espera'}
          </button>
        </>
      ) : null}
      {!busy && state.error && state.phase !== 'closed' ? (
        <button
          type="button"
          className="auth-secondary btn btn-ghost btn-block"
          onClick={() => void flow.restore()}
        >
          {en ? 'Check the same operation' : 'Consultar la misma operación'}
        </button>
      ) : null}
    </section>
  );
}

function FinishRegistration({
  runtime,
  uid,
  walletId,
  accountId,
  english: en,
}: {
  runtime: BrowserAuth;
  uid: string;
  walletId: string;
  accountId: string;
  english: boolean;
}) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    let connected = true;
    queueMicrotask(() => {
      if (!connected) return;
      void Promise.resolve()
        .then(() =>
          finishRegisteredAccount(runtime.profile(uid), walletId, accountId, controller.signal),
        )
        .then(() => {
          if (!controller.signal.aborted) router.replace(en ? '/app?lang=en' : '/app');
        })
        .catch((failure) => {
          if (!controller.signal.aborted) setError(profileMessage(failure, en));
        });
    });
    return () => {
      connected = false;
      controller.abort();
    };
  }, [runtime, uid, walletId, accountId, en, router, attempt]);
  return error ? (
    <div role="alert">
      <p>{error}</p>
      <button
        className="auth-primary btn btn-primary btn-block"
        onClick={() => {
          setError('');
          setAttempt((value) => value + 1);
        }}
      >
        {en ? 'Retry finishing setup' : 'Reintentar finalización'}
      </button>
    </div>
  ) : (
    <p role="status">{en ? 'Finishing your account…' : 'Terminando de preparar tu cuenta…'}</p>
  );
}
