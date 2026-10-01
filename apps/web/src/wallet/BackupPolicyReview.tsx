'use client';

import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import type { CredentialInventory } from '@gatopago/shared/v3/credential-inventory';
import type { CreationConsent } from '@gatopago/shared/v3/creation-operation-wire';
import type { BrowserAuth } from '../auth/browser';
import type { CreationProfilePin } from './creation-release';
import { BackupPolicyStore } from './backup-policy-store';

/** Read-only backup review. Never a prerequisite for creating or spending from an account. */
export default function BackupPolicyReview({ runtime, uid, consent, inventory, pin, english: en, onActiveChange }: {
  runtime: BrowserAuth; uid: string; consent: CreationConsent; inventory: CredentialInventory; pin: CreationProfilePin;
  english: boolean; onActiveChange: (active: boolean) => void;
}) {
  const [store] = useState(() => new BackupPolicyStore(() => runtime.credentialInventory(uid)));
  const [selected, setSelected] = useState<string[]>([]);
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot), id = useId();
  const initial = consent.preparation.credential_ref, others = inventory.data.filter((row) => row.credential_ref !== initial);
  const busy = state.phase === 'loading';
  useEffect(() => {
    const unsubscribe = runtime.subscribe((identity) => { if (identity?.uid !== uid) store.invalidate(); else store.checkSession(); });
    return () => { unsubscribe(); store.clear(); onActiveChange(false); };
  }, [runtime, uid, store, onActiveChange]);
  useEffect(() => { onActiveChange(busy); }, [busy, onActiveChange]);
  if (state.phase === 'closed') return <p className="auth-error" role="alert">{en ? 'Your session changed. Reload before reviewing keys.'
    : 'Tu sesión cambió. Recarga antes de revisar tus llaves.'}</p>;
  return <section className="account-initialization" aria-labelledby={`${id}-title`} aria-busy={busy}>
    <h4 id={`${id}-title`}>{en ? 'Optional backup keys' : 'Llaves de respaldo opcionales'}</h4>
    <p>{en ? 'One passkey is sufficient to use and administer your account. Adding another is optional. Every authorized key can spend and change security.'
      : 'Una passkey basta para usar y administrar tu cuenta. Agregar otra es opcional. Cada llave autorizada puede gastar y cambiar la seguridad.'}</p>
    <p>{en ? 'Initial key included' : 'Llave inicial incluida'}: <code>{initial.slice(-8)}</code>.</p>
    {others.length ? <form onSubmit={(event) => { event.preventDefault(); void store.review(consent, inventory, selected, pin); }}>
      <fieldset className="backup-factor-options" disabled={busy}><legend>{en ? 'Additional registered keys' : 'Llaves registradas adicionales'}</legend>
        {others.map((row) => <label key={row.credential_ref}>
          <input type="checkbox" checked={selected.includes(row.credential_ref)} onChange={(event) => {
            store.clear(); const checked = event.target.checked;
            setSelected((old) => checked ? [...old, row.credential_ref] : old.filter((ref) => ref !== row.credential_ref));
          }} /> {en ? 'Key' : 'Llave'} · {row.credential_ref.slice(-8)}
        </label>)}
        <p>{en ? 'Registered does not mean authorized onchain. Synced copies may share a provider; their names do not prove independent backups.'
          : 'Registrada no significa autorizada onchain. Las copias sincronizadas pueden compartir gestor; sus nombres no prueban respaldos independientes.'}</p>
        <button type="submit" className="auth-secondary" disabled={!selected.length}>{en ? 'Review selected keys' : 'Revisar llaves seleccionadas'}</button>
      </fieldset>
    </form> : <p>{en ? 'You can register a backup key when you want. Opening this screen does not start registration.'
      : 'Puedes registrar una llave de respaldo cuando quieras. Abrir esta pantalla no inicia el registro.'}</p>}
    {busy ? <><p role="status">{en ? 'Reading selected keys…' : 'Consultando las llaves seleccionadas…'}</p>
      <button type="button" className="auth-secondary" onClick={() => store.clear()}>{en ? 'Stop reading' : 'Detener consulta'}</button></> : null}
    {state.phase === 'error' ? <p className="auth-error" role="alert">{en ? 'The selected keys could not be verified. No policy was submitted.'
      : 'No pudimos verificar las llaves seleccionadas. No se envió ninguna política.'}</p> : null}
    {state.draft ? <div className="initialization-review" role="status">
      <h5>{en ? 'Draft — not applied' : 'Borrador — no aplicado'}</h5>
      <p>{en ? 'Any one of these keys could approve payments and security changes.' : 'Cualquiera de estas llaves podría aprobar pagos y cambios de seguridad.'}</p>
      <p>{en ? 'Losing every key makes the account inaccessible. GatoPago, support and email cannot restore access.'
        : 'Perder todas las llaves deja la cuenta inaccesible. GatoPago, soporte y el correo no pueden restablecer el acceso.'}</p>
      <p>{en ? 'More keys improve access redundancy, not protection against a compromised key. These passkeys still depend on the RP domain.'
        : 'Más llaves mejoran la redundancia de acceso, no la protección frente a una llave comprometida. Estas passkeys siguen dependiendo del dominio RP.'}</p>
      <p>{en ? 'This review does not sign or submit a change. The complete backup-enrollment interface is not enabled in this candidate.'
        : 'Esta revisión no firma ni envía cambios. La interfaz completa para autorizar respaldos no está habilitada en este candidato.'}</p>
      <details><summary>{en ? 'Technical draft details' : 'Detalles técnicos del borrador'}</summary>
        <p>RP ID: <code>{state.draft.scope.rpId}</code></p>
        <p>{en ? 'Policy hash' : 'Hash de la política'}: <code>{state.draft.hash}</code></p>
        <p>SPEND: 1/{state.draft.factors.length}. ADMIN: 1/{state.draft.factors.length}.</p>
        <ul>{state.draft.factors.map((factor) => <li key={factor.signerId}><code>{factor.credential.credential_ref.slice(-8)}</code></li>)}</ul>
      </details>
    </div> : null}
  </section>;
}
