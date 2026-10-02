'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { CredentialInventory } from '@gatopago/shared/v3/credential-inventory';
import type { CreationConsent } from '@gatopago/shared/v3/creation-operation-wire';
import type { BrowserAuth } from '../auth/browser';
import type { CreationProfilePin } from './creation-release';
import { CreationFlow } from './creation-flow';
import { creationFeeUnit, formatCreationFee } from './creation-fee';
import { requestPasskeyProof } from './passkeys';
import CreationProgress from './CreationProgress';


function message(code: string, en: boolean) {
  switch (code) {
    case 'auth/session-changed': case 'auth/unauthenticated': case 'client/update-required':
      return en ? 'Your session or app version changed. Reload and sign in before continuing.' : 'Tu sesión o versión de la app cambió. Recarga y vuelve a entrar antes de continuar.';
    case 'creation/invalid-cap':
      return en ? 'Enter a positive decimal amount, without grouping or exponent notation. Extra decimals are not rounded.' : 'Ingresa un importe decimal positivo, sin separadores de miles ni notación exponencial. No redondeamos decimales adicionales.';
    case 'creation/cap-too-low':
      return en ? 'The network estimate exceeds your limit. No operation was prepared with that limit. You may review a different limit; we will not raise it automatically.'
        : 'La estimación de red supera tu límite. No se preparó una operación con ese límite. Puedes revisar otro; no lo aumentaremos automáticamente.';
    case 'creation/expired':
      return en ? 'The signing window expired, or your device clock is incorrect. You can still read the result; no new operation will be created automatically.'
        : 'El plazo para firmar venció o el reloj del dispositivo es incorrecto. Puedes seguir consultando el resultado; no se creará otra operación automáticamente.';
    case 'cancelled':
      return en ? 'Confirmation was cancelled or unavailable. This does not mean your key is missing; recovery was not started.'
        : 'La confirmación se canceló o no estuvo disponible. Esto no significa que falte tu llave; no se inició recuperación.';
    case 'creation/conflict': case 'creation/invalid': case 'creation/not-found':
      return en ? 'The operation could not be verified consistently. Check the same request again; do not send funds based on this screen.'
        : 'No pudimos verificar la operación de forma consistente. Consulta de nuevo la misma solicitud; no envíes fondos basándote en esta pantalla.';
    default:
      return en ? 'The result is uncertain. Stopping the wait does not undo a request the server may have received. Read the same operation before continuing.'
        : 'El resultado es incierto. Detener la espera no deshace una solicitud que el servidor pudo recibir. Consulta la misma operación antes de continuar.';
  }
}

export default function CreationOperationPanel({ runtime, uid, pin, consent, knownRecorded, english: en, onActiveChange }: {
  runtime: BrowserAuth; uid: string; pin: CreationProfilePin; consent: CreationConsent; inventory: CredentialInventory; knownRecorded: boolean;
  english: boolean; onActiveChange: (active: boolean) => void;
}) {
  const [flow] = useState(() => new CreationFlow(() => runtime.creationOperation(uid, pin), requestPasskeyProof, pin, consent, knownRecorded));
  const state = useSyncExternalStore(flow.subscribe, flow.snapshot, flow.snapshot);
  const [cap, setCap] = useState('');
  const unit = creationFeeUnit(state.network);
  const busy = ['loading', 'preparing', 'proving', 'submitting'].includes(state.phase);
  useEffect(() => {
    const unsubscribe = runtime.subscribe((identity) => { if (identity?.uid !== uid) flow.invalidate(); else flow.checkSession(); });
    void flow.restore();
    return () => { unsubscribe(); flow.dispose(); onActiveChange(false); };
  }, [runtime, uid, flow, onActiveChange]);
  useEffect(() => { onActiveChange(busy); }, [busy, onActiveChange]);
  return <section className="account-initialization" aria-labelledby="creation-operation-heading" aria-busy={busy}>
    <h3 id="creation-operation-heading">{en ? 'Create the account on the network' : 'Crear la cuenta en la red'}</h3>
    <p>{en ? 'This separate confirmation authorizes the exact creation operation and its network gas terms. It does not activate payments or recovery.'
      : 'Esta confirmación separada autoriza la operación exacta de creación y sus condiciones de gas. No activa pagos ni recuperación.'}</p>
    <p>{en ? 'Network' : 'Red'}: {unit?.network ?? state.network}.</p>
    {state.error ? <p className="auth-error" role="alert">{message(state.error, en)}</p> : null}
    {!unit ? <p role="alert">{en ? 'This release cannot display and approve fees for this network. Reading remains available.'
      : 'Esta versión no puede mostrar ni aprobar cargos para esta red. Puedes seguir consultando el estado.'}</p> : null}
    {state.phase === 'absent' && unit ? <form onSubmit={(event) => { event.preventDefault(); void flow.prepare(cap); }}>
      <p>{en ? 'No creation operation is recorded for this request. Review the network terms before signing.'
        : 'No hay una operación de creación registrada para esta solicitud. Revisa las condiciones de red antes de firmar.'}</p>
      <label htmlFor="creation-gas-cap">{en ? 'Execution charge limit' : 'Límite del cargo de ejecución'} ({unit.symbol})</label>
      <input id="creation-gas-cap" inputMode="decimal" autoComplete="off" value={cap} maxLength={100} required
        aria-describedby="creation-fee-explanation" onChange={(event) => setCap(event.target.value)} />
      <p id="creation-fee-explanation">{en ? 'The next review shows who pays the network fee. This limit bounds the creation operation.'
        : 'La siguiente revisión muestra quién paga la comisión de red. Este límite acota la operación de creación.'}</p>
      <button type="submit" className="auth-primary btn btn-primary btn-block">{en ? 'Review creation operation' : 'Revisar operación de creación'}</button>
    </form> : null}
    {state.phase === 'prepare-retry' && unit && state.cap ? <>
      <p>{en ? 'The last read found no operation. Retry only this same request and approved limit' : 'La última consulta no encontró una operación. Reintenta sólo esta misma solicitud y límite aprobado'}: {formatCreationFee(BigInt(state.cap), state.network)}.</p>
      <button type="button" className="auth-primary btn btn-primary btn-block" onClick={() => void flow.prepare(cap)}>{en ? 'Retry the same preparation' : 'Reintentar la misma preparación'}</button>
    </> : null}
    {state.review ? <details className="initialization-review" open={state.receipt?.state === 'authorized' ? undefined : true}>
      <summary>{state.receipt?.state === 'authorized' ? (en ? 'Recorded operation details' : 'Detalles de la operación registrada')
        : (en ? 'Operation to authorize' : 'Operación a autorizar')}</summary>
      <p>{en ? 'Only deploy and complete the initial account configuration. No transfer, token approval or spending backup.'
        : 'Sólo desplegar y completar la configuración inicial de la cuenta. Sin transferencia, aprobación de tokens ni activación de gastos.'}</p>
      {unit ? <><p>{en ? 'Your approved execution limit' : 'Tu límite aprobado de ejecución'}: <strong>{formatCreationFee(state.review.cap, state.network)}</strong>.</p>
        <p>{en ? 'Maximum EntryPoint charge from these gas terms' : 'Cargo máximo del EntryPoint según estas condiciones de gas'}: {formatCreationFee(state.review.maximumCharge, state.network)}.</p>
        <p>{state.review.sponsored ? (en ? 'Network fee covered by GatoPago. Your account pays no gas for this operation.' : 'GatoPago cubre la comisión de red. Tu cuenta no paga gas por esta operación.') : (en ? 'The network fee is paid from your account.' : 'La comisión de red se paga desde tu cuenta.')}</p></> : null}
      <p>{en ? 'Signing deadline' : 'Plazo para firmar'}: <time dateTime={new Date(state.review.expiresAt * 1000).toISOString()}>
        {new Date(state.review.expiresAt * 1000).toLocaleString(en ? 'en-US' : 'es-BO')}</time>.</p>
      <details><summary>{en ? 'Technical operation details' : 'Detalles técnicos de la operación'}</summary>
        <p>{en ? 'Expected account address — not enabled for deposits' : 'Dirección prevista de la cuenta — no habilitada para depósitos'}: <code>{state.review.address}</code></p>
        <p>UserOperation: <code>{state.review.userOpHash}</code></p>
        <p>ExecutionPlan: <code>{state.review.digest}</code></p>
      </details>
    </details> : null}
    {state.phase === 'ready' && unit ? <button type="button" className="auth-primary btn btn-primary btn-block"
      onClick={() => void (state.signed ? flow.retryAuthorization() : flow.confirm())}>{state.signed
        ? (en ? 'Resend the same authorization, without signing again' : 'Reenviar la misma autorización, sin volver a firmar')
        : (en ? 'Authorize this creation with my key' : 'Autorizar esta creación con mi llave')}</button> : null}
    {state.phase === 'authorized' ? <CreationProgress lifecycle={state.lifecycle} delivery={state.receipt!.delivery_state}
      checkedAt={state.checkedAt} english={en} /> : null}

    <p role="note">{en ? 'Receiving and sending remain disabled here. One passkey is sufficient. Receiving requires verified deployment; losing all keys means losing access. GatoPago cannot reset the account.'
      : 'Recibir y enviar siguen deshabilitados aquí. Una passkey es suficiente. Recibir requiere verificar el despliegue; perder todas las llaves implica perder el acceso. GatoPago no puede restablecer la cuenta.'}</p>
    {busy ? <><p role="status">{state.phase === 'proving' ? (en ? 'Confirm the creation in your browser…' : 'Confirma la creación en tu navegador…')
      : state.phase === 'loading' ? (en ? 'Reading the same operation…' : 'Consultando la misma operación…') : (en ? 'Checking with GatoPago…' : 'Comprobando con GatoPago…')}</p>
      <button type="button" className="auth-secondary btn btn-ghost btn-block" onClick={() => flow.stop()}>{en ? 'Stop waiting' : 'Detener espera'}</button></> : null}
    {!busy && state.phase !== 'closed' ? <button type="button" className="auth-secondary btn btn-ghost btn-block" onClick={() => void flow.restore()}>
      {en ? 'Check the same operation' : 'Consultar la misma operación'}</button> : null}
  </section>;
}
