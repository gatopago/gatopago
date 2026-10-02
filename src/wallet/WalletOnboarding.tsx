'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { BrowserAuth } from '../auth/browser';
import { reloadPage } from '../pwa/reload-guard';
import { NavigationLink } from '../consumer/NavigationLink';
import { localizedPath } from '../consumer/routes';
import { CredentialInventoryStore } from './credential-inventory-store';
import InitializationHistory from './InitializationHistory';

export default function WalletOnboarding({ runtime, uid, english: en }: { runtime?: BrowserAuth; uid?: string; english: boolean }) {
  if (!runtime || !uid) return <><h1>{en ? 'Create your wallet' : 'Crea tu wallet'}</h1><p role="status">{en ? 'Sign in to continue setting up your wallet.' : 'Inicia sesión para continuar configurando tu wallet.'}</p>
    <NavigationLink href={localizedPath('/login', en)} className="auth-primary btn btn-primary btn-block">{en ? 'Sign in' : 'Iniciar sesión'}</NavigationLink></>;
  return <WalletSetup key={uid} runtime={runtime} uid={uid} english={en} />;
}

function WalletSetup({ runtime, uid, english: en }: { runtime: BrowserAuth; uid: string; english: boolean }) {
  const [store] = useState(() => new CredentialInventoryStore(() => runtime.credentialInventory(uid)));
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  const [active, setActive] = useState(false);
  const pin = runtime.initializationProfile();
  useEffect(() => {
    void store.load();
    const unsubscribe = runtime.subscribe(identity => { if (identity?.uid !== uid) store.invalidate(); else store.checkSession(); });
    return () => { unsubscribe(); store.cancel(); };
  }, [runtime, uid, store]);
  const sessionError = (state.phase === 'error' || state.phase === 'closed') && ['auth/session-changed', 'auth/unauthenticated', 'client/update-required'].includes(state.code);
  return <section aria-labelledby="wallet-setup-heading">
    <h1 id="wallet-setup-heading">{en ? 'Create your wallet' : 'Crea tu wallet'}</h1>
    <ol className="auth-steps" aria-label={en ? 'Account creation progress' : 'Progreso de creación de cuenta'}>
      <li>{en ? '1. Details saved' : '1. Datos guardados'}</li><li>{en ? '2. Passkey verified' : '2. Passkey comprobada'}</li><li aria-current="step">3. Wallet</li>
    </ol>
    <p>{en ? 'Your access is ready. Now authorize your wallet configuration and its creation on the network. You will use your registered passkey; a backup is optional.' : 'Tu acceso está listo. Ahora autoriza la configuración y creación de tu wallet en la red. Usarás tu passkey registrada; el respaldo es opcional.'}</p>
    {!pin ? <div className="auth-local" role="status"><p>{en ? 'Wallet creation is not enabled in this environment. Your account and passkey are already registered. Return here when creation is available.' : 'La creación de wallets no está habilitada en este entorno. Tu cuenta y passkey ya están registradas. Puedes volver aquí cuando la creación esté disponible.'}</p></div>
      : state.phase === 'loading' ? <p role="status">{en ? 'Checking your registered passkey…' : 'Consultando tu passkey registrada…'}</p>
        : state.phase === 'ready' ? state.inventory.data.length > 0
          ? <InitializationHistory runtime={runtime} uid={uid} inventory={state.inventory} english={en} pin={pin} onActiveChange={setActive} />
          : <div role="status"><p>{en ? 'No registered passkey was found for this account. Review your keys before creating the wallet.' : 'No encontramos una passkey registrada para esta cuenta. Revisa tus llaves antes de crear la wallet.'}</p>
            <NavigationLink href={localizedPath('/settings/security', en)} className="auth-secondary btn btn-ghost btn-block">{en ? 'Review my keys' : 'Revisar mis llaves'}</NavigationLink></div>
          : <div className="auth-error" role="alert"><p>{sessionError ? (en ? 'Your session or app version changed. Reload and sign in to resume.' : 'Tu sesión o versión de la app cambió. Recarga e inicia sesión para retomar.')
            : en ? 'We could not check your passkey. Your progress has not been replaced; retry this check.' : 'No pudimos consultar tu passkey. Tu progreso no se ha reemplazado; reintenta la consulta.'}</p>
            <button type="button" className="auth-secondary btn btn-ghost btn-block" onClick={() => sessionError ? reloadPage() : void store.load()}>{sessionError ? (en ? 'Reload' : 'Recargar') : en ? 'Retry' : 'Reintentar'}</button></div>}
    {!active ? <NavigationLink href={localizedPath('/app', en)} className="auth-secondary btn btn-ghost btn-block">{en ? 'Go to my account' : 'Ir a mi cuenta'}</NavigationLink> : null}
    <p className="auth-access-note">{en ? 'You can return to this setup from your account. Existing requests are checked before starting a new one.' : 'Puedes retomar la configuración desde tu cuenta. Antes de iniciar otra solicitud, comprobamos las existentes.'}</p>
  </section>;
}
