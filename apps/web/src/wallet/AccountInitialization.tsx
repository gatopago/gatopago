'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { CredentialInventory } from '@gatopago/shared/v3/credential-inventory';
import type { InitializationHistoryItem } from '@gatopago/shared/v3/initialization-wire';
import type { BrowserAuth } from '../auth/browser';
import { reloadPage } from '../pwa/reload-guard';
import type { CreationProfilePin } from './creation-release';
import { InitializationFlow } from './initialization-flow';
import { requestPasskeyProof } from './passkeys';
import CreationOperationPanel from './CreationOperationPanel';

function message(code: string, en: boolean) {
  switch (code) {
    case 'auth/session-changed': case 'auth/unauthenticated':
      return en ? 'Your session changed or expired. Sign in again before continuing.' : 'Tu sesión cambió o venció. Vuelve a entrar antes de continuar.';
    case 'client/update-required':
      return en ? 'Update GatoPago before continuing.' : 'Actualiza GatoPago antes de continuar.';
    case 'initialization/expired': case 'expired':
      return en ? 'The authorization window expired, or your device clock is incorrect. No new authorization will be signed automatically.' : 'El plazo venció o el reloj del dispositivo es incorrecto. No se firmará otra autorización automáticamente.';
    case 'initialization/profile-unavailable':
      return en ? 'This account version is not available. No alternative network or older account will be selected automatically.' : 'Esta versión de cuenta no está disponible. No se elegirá automáticamente otra red ni una cuenta antigua.';
    case 'initialization/limit':
      return en ? 'The request limit was reached. Wait before retrying this same request.' : 'Se alcanzó el límite de solicitudes. Espera antes de reintentar esta misma solicitud.';
    case 'initialization/invalid': case 'initialization/conflict': case 'invalid-response':
      return en ? 'We could not validate this consent or its result. Do not send funds; account availability has not been confirmed.' : 'No pudimos validar este consentimiento o su resultado. No envíes fondos; la disponibilidad de la cuenta no está confirmada.';
    case 'cancelled':
      return en ? 'The browser did not finish the confirmation. This does not mean your key is missing; recovery was not started.' : 'El navegador no completó la confirmación. Esto no significa que falte tu llave; no se inició ninguna recuperación.';
    case 'context': case 'unsupported':
      return en ? 'Open GatoPago directly in a compatible browser and press confirm again.' : 'Abre GatoPago directamente en un navegador compatible y vuelve a pulsar confirmar.';
    case 'initialization/result-unknown':
      return en ? 'Stopping the wait does not undo an authorization the server may have received. Verify the same request without signing again.' : 'Detener la espera no deshace una autorización que el servidor pudo recibir. Verifica la misma solicitud sin volver a firmar.';
    default:
      return en ? 'We could not confirm the result. Check your connection and retry the same request.' : 'No pudimos confirmar el resultado. Revisa tu conexión y reintenta la misma solicitud.';
  }
}

export default function AccountInitialization({ runtime, uid, inventory, english: en, pin, onActiveChange, resume }: {
  runtime: BrowserAuth; uid: string; inventory: CredentialInventory; english: boolean; pin: CreationProfilePin; onActiveChange: (active: boolean) => void;
  resume?: InitializationHistoryItem;
}) {
  const [flow] = useState(() => new InitializationFlow(() => runtime.initialization(uid, pin), requestPasskeyProof, pin, inventory));
  const state = useSyncExternalStore(flow.subscribe, flow.snapshot, flow.snapshot);
  const [selected, setSelected] = useState<string>(resume?.credential_ref ?? inventory.data[0]?.credential_ref ?? '');
  const [creationActive, setCreationActive] = useState(false);
  useEffect(() => {
    const unsubscribe = runtime.subscribe((identity) => {
      if (identity?.uid !== uid) flow.invalidate(); else flow.checkSession();
    });
    return () => { unsubscribe(); flow.dispose(); onActiveChange(false); };
  }, [runtime, uid, flow, onActiveChange]);
  useEffect(() => { if (resume) void flow.restore(resume); }, [flow, resume]);
  useEffect(() => { onActiveChange(creationActive || !['idle', 'done', 'closed', 'operation-recorded'].includes(state.phase)); }, [state.phase, creationActive, onActiveChange]);
  const busy = ['preparing', 'restoring', 'proving', 'submitting'].includes(state.phase);
  return <section className="account-initialization" aria-labelledby="initial-account-heading" aria-busy={busy}>
    <h3 id="initial-account-heading">{en ? 'Initial account configuration' : 'Configuración inicial de tu cuenta'}</h3>
    {!state.consent ? <><p>{resume ? (en ? 'We are reading the existing request with its original key and terms. Reading it does not create another account or request another signature.'
      : 'Consultamos la solicitud existente con su llave y condiciones originales. Leerla no crea otra cuenta ni solicita otra firma.')
      : (en ? 'Choose a registered key to authorize the initial configuration of your V3 account. No new passkey will be created.'
        : 'Elige una llave registrada para autorizar la configuración inicial de tu cuenta V3. No se creará otra passkey.')}</p>
    <label htmlFor="initial-account-key">{en ? 'Key to confirm with' : 'Llave para confirmar'}</label>
    <select id="initial-account-key" value={selected} disabled={!!resume || state.phase !== 'idle'} onChange={(event) => setSelected(event.target.value)}>
      {inventory.data.map((key, index) => <option key={key.credential_ref} value={key.credential_ref}>
        {en ? 'Key' : 'Llave'} {index + 1} · {key.credential_ref.slice(-8)}
      </option>)}
    </select></> : null}
    {state.error ? <p className="auth-error" role="alert">{message(state.error, en)}</p> : null}
    {state.review ? <details className="initialization-review" open={state.consent ? undefined : true}>
      <summary>{en ? 'Configuration in this request' : 'Configuración de esta solicitud'}</summary>
      <ul>
        <li>{en ? 'Account V3 with the selected key. Once deployment is verified, that key can authorize payments.' : 'Cuenta V3 con la llave seleccionada. Tras verificar el despliegue, esa llave podrá autorizar pagos.'}</li>
        <li>{en ? 'Initial network' : 'Red inicial'}: {state.review.network}.</li>
        <li>{en ? 'This consent does not send funds, approve a specific payment or configure recovery.' : 'Este consentimiento no envía fondos, no aprueba un pago concreto ni configura recuperación.'}</li>
        <li>{en ? 'You do not need a second passkey to use the account. Adding a backup is optional and requires a separate authorization.' : 'No necesitas una segunda passkey para usar la cuenta. Añadir un respaldo es opcional y requiere una autorización aparte.'}</li>
        <li>{en ? 'If you lose all authorized keys, GatoPago cannot restore access to your funds.' : 'Si pierdes todas las llaves autorizadas, GatoPago no puede restablecer el acceso a tus fondos.'}</li>
      </ul>
      <p>{en ? 'Authorization expires' : 'La autorización vence'}: <time dateTime={new Date(state.review.validUntil * 1000).toISOString()}>
        {new Date(state.review.validUntil * 1000).toLocaleString(en ? 'en-US' : 'es-BO')}</time>.</p>
      <details><summary>{en ? 'Technical consent details' : 'Detalles técnicos del consentimiento'}</summary>
        <p>{en ? 'Generation' : 'Generación'}: {state.review.generation}</p>
        <p>InitializationApproval: <code>{state.review.digest}</code></p>
        <p>{en ? 'Release profile' : 'Perfil de la versión'}: <code>{state.review.profileDigest}</code></p>
      </details>
    </details> : null}
    {!resume && (state.phase === 'idle' || state.phase === 'prepare-retry') ? <button type="button" className="auth-primary" disabled={!selected}
      onClick={() => void flow.prepare(selected)}>{state.phase === 'idle'
        ? (en ? 'Review initial configuration' : 'Revisar configuración inicial')
        : (en ? 'Retry preparation' : 'Reintentar preparación')}</button> : null}
    {state.phase === 'ready' ? <button type="button" className="auth-primary" onClick={() => void flow.confirm()}>
      {en ? 'Authorize this configuration with my key' : 'Autorizar esta configuración con mi llave'}</button> : null}
    {state.phase === 'restore-retry' && resume ? <button type="button" className="auth-secondary" onClick={() => void flow.restore(resume)}>
      {en ? 'Retry reading this request' : 'Reintentar lectura de esta solicitud'}</button> : null}
    {state.phase === 'retry' ? <><p>{en ? 'We will resend exactly the same signed consent. You will not be asked to sign again.'
      : 'Reenviaremos exactamente el mismo consentimiento firmado. No se te pedirá otra firma.'}</p>
      <button type="button" className="auth-primary" onClick={() => void flow.retry()}>{en ? 'Verify the same authorization' : 'Verificar la misma autorización'}</button></> : null}
    {state.phase === 'restart' ? <button type="button" className="auth-secondary" onClick={() => flow.cancel()}>
      {state.submissionStarted ? (en ? 'Check the existing request' : 'Revisar la solicitud existente') : (en ? 'Review again' : 'Revisar de nuevo')}</button> : null}
    {state.phase === 'done' ? <div role="status"><h4>{en ? 'Consent recorded' : 'Consentimiento registrado'}</h4>
      <p>{en ? 'The server confirmed your authorization. This consent does not confirm deployment or permission to receive or send funds.'
        : 'El servidor confirmó tu autorización. Este consentimiento no confirma el despliegue ni la habilitación para recibir o enviar fondos.'}</p>
      <p>{en ? 'Reference' : 'Referencia'}: <code>{state.reference}</code></p></div> : null}
    {state.phase === 'operation-recorded' ? <div role="status"><h4>{en ? 'Existing creation process' : 'Proceso de creación existente'}</h4>
      <p>{en ? 'This request already has a creation operation. We will read it below without repeating the initial consent.'
        : 'Esta solicitud ya tiene una operación de creación. La consultaremos abajo sin repetir el consentimiento inicial.'}</p>
      <p>{en ? 'Reference' : 'Referencia'}: <code>{state.reference}</code></p></div> : null}
    {state.consent && ['done', 'operation-recorded'].includes(state.phase) ? <CreationOperationPanel key={state.consent.preparation.initialization_id}
      runtime={runtime} uid={uid} pin={pin} consent={state.consent} inventory={inventory} knownRecorded={state.phase === 'operation-recorded'}
      english={en} onActiveChange={setCreationActive} /> : null}
    {state.phase === 'closed' ? <button type="button" className="auth-secondary" onClick={() => reloadPage()}>
      {en ? 'Reload and check session' : 'Recargar y comprobar sesión'}</button> : null}
    {busy ? <p role="status">{state.phase === 'proving'
      ? (en ? 'Confirm this configuration in your browser…' : 'Confirma esta configuración en tu navegador…')
      : (en ? 'Checking with GatoPago…' : 'Comprobando con GatoPago…')}</p> : null}
    {!['idle', 'done', 'closed', 'operation-recorded', 'restart', 'retry'].includes(state.phase) ? <button type="button" className="auth-secondary" onClick={() => flow.cancel()}>
      {state.submissionStarted ? (en ? 'Stop waiting' : 'Detener espera') : (en ? 'Cancel configuration' : 'Cancelar configuración')}</button> : null}
  </section>;
}
