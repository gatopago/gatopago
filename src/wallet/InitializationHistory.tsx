'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { CredentialInventory } from '@gatopago/shared/v3/credential-inventory';
import type { InitializationHistoryItem } from '@gatopago/shared/v3/initialization-wire';
import type { BrowserAuth } from '../auth/browser';
import type { CreationProfilePin } from './creation-release';
import AccountInitialization from './AccountInitialization';
import { InitializationHistoryStore, initialSetupChoice } from './initialization-history-store';

export default function InitializationHistory({ runtime, uid, inventory, english: en, pin, onActiveChange }: {
  runtime: BrowserAuth; uid: string; inventory: CredentialInventory; english: boolean; pin: CreationProfilePin; onActiveChange: (active: boolean) => void;
}) {
  const [store] = useState(() => new InitializationHistoryStore(() => runtime.initialization(uid, pin)));
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  const [selection, setSelection] = useState<InitializationHistoryItem | 'new' | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [childActive, setChildActive] = useState(false);
  useEffect(() => {
    void store.refresh();
    const unsubscribe = runtime.subscribe((identity) => { if (identity?.uid !== uid) store.invalidate(); else store.checkSession(); });
    return () => { unsubscribe(); store.cancel(); onActiveChange(false); };
  }, [runtime, uid, store, onActiveChange]);
  useEffect(() => { onActiveChange(state.phase === 'loading' || childActive); }, [state.phase, childActive, onActiveChange]);
  if (state.phase === 'closed') return <p role="alert">{en ? 'Your session or app version changed. Reload and sign in before continuing.'
    : 'Tu sesión o versión de la app cambió. Recarga y vuelve a entrar antes de continuar.'}</p>;
  const automatic = !showHistory && state.phase === 'ready'
    ? initialSetupChoice(state.history, state.canStart, pin.digest, inventory.data.map(key => key.credential_ref)) : null;
  const chosen = selection ?? automatic;
  if (chosen && state.phase === 'ready') return <>
    <AccountInitialization key={chosen === 'new' ? 'new' : chosen.initialization_id} runtime={runtime} uid={uid}
      inventory={inventory} english={en} pin={pin} onActiveChange={setChildActive} resume={chosen === 'new' ? undefined : chosen} />
    <details className="mt-5 text-[12px] text-text-muted"><summary>{en ? 'Previous requests' : 'Solicitudes anteriores'}</summary>
      <button type="button" className="auth-secondary btn btn-ghost btn-block" disabled={childActive} onClick={() => { setSelection(null); setShowHistory(true); void store.refresh(); }}>
        {en ? 'Review previous requests' : 'Revisar solicitudes anteriores'}</button></details>
  </>;
  return <section className="account-initialization" aria-labelledby="initialization-history-heading" aria-busy={state.phase === 'loading'}>
    <h2 id="initialization-history-heading" className="sr-only">{en ? 'Account creation' : 'Creación de tu cuenta'}</h2>
    {state.phase === 'loading' ? <p role="status">{en ? 'Restoring your progress…' : 'Comprobando tu progreso…'}</p> : null}
    {state.phase === 'error' ? <><p role="alert">{en ? 'We could not check your previous requests. This does not mean you need a new account.'
      : 'No pudimos consultar tus solicitudes anteriores. Esto no significa que necesites otra cuenta.'}</p>
      <button type="button" className="auth-secondary btn btn-ghost btn-block" onClick={() => void store.retry()}>{en ? 'Retry history' : 'Reintentar historial'}</button></> : null}
    {state.phase === 'ready' ? <>
      {state.history.data.length ? <ul>{state.history.data.map((item) => {
        const supported = item.profile_sha256 === pin.digest && inventory.data.some((key) => key.credential_ref === item.credential_ref);
        return <li key={item.initialization_id}>
          <p>{item.creation_operation_recorded ? (en ? 'Creation operation recorded' : 'Operación de creación registrada')
            : item.state === 'authorized' ? (en ? 'Consent recorded' : 'Consentimiento registrado')
              : item.state === 'expired' ? (en ? 'Expired without consent' : 'Vencida sin consentimiento') : (en ? 'Awaiting consent' : 'Pendiente de consentimiento')}
            {' · '}<time dateTime={new Date(item.created_at * 1000).toISOString()}>{new Date(item.created_at * 1000).toLocaleString(en ? 'en-US' : 'es-BO')}</time></p>
          <p>{en ? 'Reference' : 'Referencia'}: <code>{item.initialization_id}</code></p>
          {supported ? <button type="button" className="auth-secondary btn btn-ghost btn-block" onClick={() => setSelection(item)}>{en ? 'Review existing request' : 'Revisar solicitud existente'}</button>
            : <p role="note">{en ? 'This request cannot be resumed with this version or key inventory. It will not be replaced automatically.'
              : 'Esta solicitud no se puede retomar con esta versión o lista de llaves. No se reemplazará automáticamente.'}</p>}
        </li>;
      })}</ul> : <p>{en ? 'No requests in this page.' : 'No hay solicitudes en esta página.'}</p>}
      {state.history.next_cursor ? <button type="button" className="auth-secondary btn btn-ghost btn-block" onClick={() => void store.next()}>{en ? 'Older requests' : 'Solicitudes anteriores'}</button> : null}
      {state.canStart ? <button type="button" className="auth-primary btn btn-primary btn-block" onClick={() => setSelection('new')}>{en ? 'Continue creating my account' : 'Continuar creando mi cuenta'}</button>
        : <p role="note">{en ? 'Review the existing requests before starting another configuration. This history does not confirm onchain account availability.'
          : 'Revisa las solicitudes existentes antes de iniciar otra configuración. Este historial no confirma la disponibilidad onchain de la cuenta.'}</p>}
      <button type="button" className="auth-secondary btn btn-ghost btn-block" onClick={() => void store.refresh()}>{en ? 'Refresh configuration history' : 'Actualizar historial de configuración'}</button>
    </> : null}
  </section>;
}
