'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { BrowserAuth } from '../auth/browser';
import { EnrollmentFlow } from './enrollment-flow';
import { requestPasskeyRegistration, requestPasskeyProof } from './passkeys';
import { reloadPage } from '../pwa/reload-guard';
import CredentialInventory from './CredentialInventory';

function message(code: string, en: boolean) {
  switch (code) {
    case 'auth/session-changed':
    case 'auth/unauthenticated':
      return en
        ? 'Your session changed or expired. Sign in again before continuing.'
        : 'Tu sesión cambió o venció. Vuelve a entrar antes de continuar.';
    case 'client/update-required':
      return en ? 'Update GatoPago before continuing.' : 'Actualiza GatoPago antes de continuar.';
    case 'already-registered':
      return en
        ? 'The selected manager already has a registered key. It was not deleted. To add an independent backup, use another manager or a physical security key.'
        : 'El gestor elegido ya tiene una llave registrada. No se eliminó. Para añadir un respaldo independiente, usa otro gestor o una llave física.';
    case 'enrollment/expired':
    case 'expired':
      return en
        ? 'The registration window expired. Start again; a key already saved on your device may remain there.'
        : 'Venció el plazo de registro. Comienza de nuevo; una llave que ya se guardó en tu dispositivo puede seguir allí.';
    case 'cancelled':
      return en
        ? 'The browser did not finish the confirmation. You can try again; recovery was not started.'
        : 'El navegador no completó la confirmación. Puedes reintentar; no se inició ninguna recuperación.';
    case 'unsupported':
    case 'context':
      return en
        ? 'Use a compatible browser directly on GatoPago, then press the button again. Passkeys need a secure context and an explicit action.'
        : 'Usa un navegador compatible directamente en GatoPago y vuelve a pulsar el botón. Las passkeys requieren un contexto seguro y una acción explícita.';
    case 'enrollment/limit':
      return en
        ? 'The registration limit was reached. Wait before trying again.'
        : 'Se alcanzó el límite de registros. Espera antes de reintentar.';
    case 'enrollment/invalid':
    case 'invalid-response':
    case 'enrollment/conflict':
      return en
        ? 'We could not validate this registration. It does not grant payment permissions. Start again to check the current state.'
        : 'No pudimos validar este registro. No concede permisos para pagar. Comienza de nuevo para comprobar el estado actual.';
    default:
      return en
        ? 'We could not confirm the result. Check your connection. Retrying confirmation does not create another key.'
        : 'No pudimos confirmar el resultado. Revisa tu conexión. Reintentar la confirmación no crea otra llave.';
  }
}

export default function SecurityEnrollment({
  runtime,
  uid,
  english: en = false,
}: {
  runtime: BrowserAuth;
  uid: string;
  english?: boolean;
}) {
  // Construction is read-only. Only the inventory is read on mount; no ceremony.
  const [flow] = useState(
    () =>
      new EnrollmentFlow(() => runtime.enrollment(uid), {
        create: requestPasskeyRegistration,
        prove: requestPasskeyProof,
      }),
  );
  const state = useSyncExternalStore(flow.subscribe, flow.snapshot, flow.snapshot);
  const [preference, setPreference] = useState<'default' | 'security-key'>('default');
  useEffect(() => {
    const unsubscribe = runtime.subscribe((identity) => {
      if (identity?.uid !== uid) flow.invalidate();
      else flow.checkSession();
    });
    return () => {
      unsubscribe();
      flow.cancel();
    };
  }, [runtime, uid, flow]);
  const busy = ['preparing', 'creating', 'proving', 'submitting'].includes(state.phase);
  return (
    <section aria-labelledby="passkey-heading" aria-busy={busy}>
      <h2 id="passkey-heading">{en ? 'Your access keys' : 'Tus llaves de acceso'}</h2>
      <p>
        {en
          ? 'Your device or password manager keeps the private key. GatoPago verifies and stores its public part.'
          : 'Tu dispositivo o gestor conserva la llave privada. GatoPago verifica y registra su parte pública.'}
      </p>
      <p className="auth-local" role="note">
        {en
          ? 'Registering a key does not create an onchain account or add a signer to an existing one. One authorized key is enough to use your verified account; adding a backup is optional and requires a separate authorization.'
          : 'Registrar una llave no crea una cuenta onchain ni añade un firmante a una cuenta existente. Una llave autorizada basta para usar tu cuenta verificada; añadir un respaldo es opcional y requiere una autorización aparte.'}
      </p>
      <fieldset className="security-actions">
        <legend>{en ? 'Key registration' : 'Registro de llaves'}</legend>
        {state.error ? (
          <p className="auth-error" role="alert">
            {message(state.error, en)}
          </p>
        ) : null}
        {state.keyMayExist && ['idle', 'restart'].includes(state.phase) ? (
          <p>
            {en
              ? 'Cancelling does not remove a saved key or undo a registration already received by the server. A key in your manager alone does not prove registration.'
              : 'Cancelar no borra una llave guardada ni deshace un registro que ya llegó al servidor. Una llave en tu gestor, por sí sola, no demuestra que el registro esté confirmado.'}
          </p>
        ) : null}
        {state.phase === 'idle' ? (
          <button
            type="button"
            className="auth-primary btn btn-primary btn-block"
            onClick={() => void flow.prepare()}
          >
            {en ? 'Prepare key registration' : 'Preparar registro de llave'}
          </button>
        ) : null}
        {state.phase === 'ready' ? (
          <>
            <p>
              {en
                ? 'Your device will ask where to save your access key.'
                : 'Tu dispositivo te preguntará dónde guardar tu llave de acceso.'}
            </p>
            <button
              type="button"
              className="auth-primary btn btn-primary btn-block"
              onClick={() => void flow.create(preference)}
            >
              {en ? 'Add an access key' : 'Añadir una llave de acceso'}
            </button>
            <details>
              <summary>
                {en ? 'Where is it saved? More options' : '¿Dónde se guarda? Otras opciones'}
              </summary>
              <p>
                {en
                  ? 'The browser and your configured managers offer the available choices. GatoPago cannot force iCloud, Google or another manager, or promise synchronization between them.'
                  : 'El navegador y tus gestores configurados ofrecen las opciones disponibles. GatoPago no puede imponer iCloud, Google u otro gestor ni prometer sincronización entre ellos.'}
              </p>
              <label>
                <input
                  type="radio"
                  name="key-preference"
                  checked={preference === 'default'}
                  onChange={() => setPreference('default')}
                />
                {en ? 'Let my browser offer the options' : 'Que mi navegador ofrezca las opciones'}
              </label>
              <label>
                <input
                  type="radio"
                  name="key-preference"
                  checked={preference === 'security-key'}
                  onChange={() => setPreference('security-key')}
                />
                {en ? 'Use a physical security key' : 'Usar una llave física'}
              </label>
            </details>
          </>
        ) : null}
        {state.phase === 'proof' ? (
          <>
            <p>
              {en
                ? 'Your manager created the key. Test it now to confirm you can use it; this does not sign a payment.'
                : 'Tu gestor creó la llave. Pruébala ahora para confirmar que puedes usarla; esto no firma un pago.'}
            </p>
            <button
              type="button"
              className="auth-primary btn btn-primary btn-block"
              onClick={() => void flow.prove()}
            >
              {en ? 'Test and register this key' : 'Probar y registrar esta llave'}
            </button>
          </>
        ) : null}
        {state.phase === 'retry' ? (
          <button
            type="button"
            className="auth-primary btn btn-primary btn-block"
            onClick={() => void flow.retry()}
          >
            {en ? 'Retry confirmation' : 'Reintentar confirmación'}
          </button>
        ) : null}
        {state.phase === 'restart' ? (
          <button
            type="button"
            className="auth-secondary btn btn-ghost btn-block"
            onClick={() => flow.cancel()}
          >
            {en ? 'Start again' : 'Comenzar de nuevo'}
          </button>
        ) : null}
        {state.phase === 'done' ? (
          <>
            <div role="status">
              <h3>{en ? 'Key tested and registered' : 'Llave probada y registrada'}</h3>
              <p>
                {en
                  ? 'Registration was confirmed by Wallet Core. No account was activated and no funds were moved.'
                  : 'Wallet Core confirmó el registro. No se activó una cuenta ni se movieron fondos.'}
              </p>
            </div>
            <button
              type="button"
              className="auth-secondary btn btn-ghost btn-block"
              onClick={() => flow.cancel()}
            >
              {en ? 'Register another key' : 'Registrar otra llave'}
            </button>
          </>
        ) : null}
        {state.phase === 'closed' ? (
          <button
            type="button"
            className="auth-secondary btn btn-ghost btn-block"
            onClick={() => reloadPage()}
          >
            {en ? 'Reload and check session' : 'Recargar y comprobar sesión'}
          </button>
        ) : null}
        {busy ? (
          <p role="status">
            {state.phase === 'creating' || state.phase === 'proving'
              ? en
                ? 'Complete the request in your browser…'
                : 'Completa la solicitud en tu navegador…'
              : en
                ? 'Confirming with GatoPago…'
                : 'Confirmando con GatoPago…'}
          </p>
        ) : null}
        {!['idle', 'restart', 'done', 'closed'].includes(state.phase) ? (
          <button
            type="button"
            className="auth-secondary btn btn-ghost btn-block"
            onClick={() => flow.cancel()}
          >
            {en ? 'Cancel registration' : 'Cancelar registro'}
          </button>
        ) : null}
      </fieldset>
      <CredentialInventory
        key={uid}
        runtime={runtime}
        uid={uid}
        english={en}
        enrollmentDone={state.phase === 'done'}
        enrollmentBusy={busy}
      />
    </section>
  );
}
