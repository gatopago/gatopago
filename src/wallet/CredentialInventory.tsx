'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { BrowserAuth } from '../auth/browser';
import { CredentialInventoryStore } from './credential-inventory-store';

export default function CredentialInventory({
  runtime,
  uid,
  english: en,
  enrollmentDone,
  enrollmentBusy,
}: {
  runtime: BrowserAuth;
  uid: string;
  english: boolean;
  enrollmentDone: boolean;
  enrollmentBusy: boolean;
}) {
  const [store] = useState(
    () => new CredentialInventoryStore(() => runtime.credentialInventory(uid)),
  );
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  useEffect(() => {
    void store.load();
    const unsubscribe = runtime.subscribe((identity) => {
      if (identity?.uid !== uid) store.invalidate();
      else store.checkSession();
    });
    return () => {
      unsubscribe();
      store.cancel();
    };
  }, [store, runtime, uid]);
  useEffect(() => {
    if (enrollmentDone) void store.load();
  }, [store, enrollmentDone]);
  const reauth =
    (state.phase === 'closed' || state.phase === 'error') &&
    (state.code === 'auth/session-changed' || state.code === 'auth/unauthenticated');
  return (
    <section aria-labelledby="registered-keys-heading" aria-busy={state.phase === 'loading'}>
      <h3 id="registered-keys-heading">
        {en ? 'Keys registered with GatoPago' : 'Llaves registradas en GatoPago'}
      </h3>
      <p>
        {en
          ? 'This list does not tell us whether a key is available on this device or which onchain permissions it currently has.'
          : 'Esta lista no indica si una llave está disponible en este dispositivo ni qué permisos tiene actualmente onchain.'}
      </p>
      {state.phase === 'loading' ? (
        <p role="status">{en ? 'Checking registered keys…' : 'Consultando llaves registradas…'}</p>
      ) : null}
      {state.phase === 'error' || state.phase === 'closed' ? (
        <p role={state.code === 'credentials/profile-required' ? 'note' : 'alert'}>
          {reauth
            ? en
              ? 'Your session changed or expired. Sign in again to check your keys.'
              : 'Tu sesión cambió o venció. Vuelve a entrar para consultar tus llaves.'
            : state.code === 'credentials/profile-required'
              ? en
                ? 'Your V3 security profile will be prepared when you choose to register a key.'
                : 'Tu perfil de seguridad V3 se preparará cuando elijas registrar una llave.'
              : en
                ? 'We could not check your keys. This does not mean you have no keys or need recovery.'
                : 'No pudimos consultar tus llaves. Esto no significa que no tengas llaves ni que necesites recuperar la cuenta.'}
        </p>
      ) : null}
      {state.phase === 'ready' ? (
        <>
          <p role="status">
            {en
              ? `Registered keys: ${state.inventory.data.length}`
              : `Llaves registradas: ${state.inventory.data.length}`}
          </p>
          {state.inventory.data.length === 0 ? (
            <p>
              {en
                ? 'No completed V3 key registrations were found for this profile. Your password manager may still contain other keys.'
                : 'Este perfil no tiene registros de llaves V3 completados. Tu gestor puede conservar otras llaves.'}
            </p>
          ) : (
            <ul>
              {state.inventory.data.map((key, index) => (
                <li key={key.credential_ref}>
                  <h4>
                    {en ? 'Key' : 'Llave'} {index + 1} · {key.credential_ref.slice(-8)}
                  </h4>
                  <p>
                    {en ? 'Registered' : 'Registrada'}:{' '}
                    <time dateTime={new Date(key.created_at * 1000).toISOString()}>
                      {new Date(key.created_at * 1000).toLocaleString(en ? 'en-US' : 'es-BO')}
                    </time>
                  </p>
                  <details>
                    <summary>
                      {en ? 'Registration information' : 'Información del registro'}
                    </summary>
                    <p>
                      {key.backup_eligible
                        ? en
                          ? 'The authenticator reported support for synchronized backups.'
                          : 'El autenticador informó que admite respaldo sincronizado.'
                        : en
                          ? 'The authenticator reported a key without synchronized-backup support.'
                          : 'El autenticador informó una llave sin respaldo sincronizado.'}
                    </p>
                    <p>
                      {key.backed_up_at_registration
                        ? en
                          ? 'It reported a backup when registration was completed.'
                          : 'Informó que tenía respaldo al completar el registro.'
                        : en
                          ? 'It did not report a backup when registration was completed.'
                          : 'No informó que tuviera respaldo al completar el registro.'}
                    </p>
                    <p>
                      {en
                        ? 'These are registration observations, not a current check or proof of an independent recovery factor.'
                        : 'Son observaciones del registro, no una comprobación actual ni prueba de un factor de recuperación independiente.'}
                    </p>
                    <p>
                      {en ? 'Reported transports' : 'Transportes informados'}:{' '}
                      {key.transports.join(', ') || (en ? 'not provided' : 'no informados')}.
                    </p>
                    <p>
                      {en
                        ? 'This information does not verify the identity of the password manager or guarantee access from another device.'
                        : 'Esta información no verifica la identidad del gestor ni garantiza acceso desde otro dispositivo.'}
                    </p>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
      {!reauth ? (
        <button
          type="button"
          className="auth-secondary btn btn-ghost btn-block"
          disabled={state.phase === 'loading' || enrollmentBusy}
          onClick={() => void store.load()}
        >
          {en ? 'Refresh registered keys' : 'Actualizar lista de llaves'}
        </button>
      ) : null}
    </section>
  );
}
