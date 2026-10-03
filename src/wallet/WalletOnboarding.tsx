'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { BrowserAuth } from '../auth/browser';
import { reloadPage } from '../pwa/reload-guard';
import { NavigationLink } from '../consumer/NavigationLink';
import { localizedPath } from '../consumer/routes';
import { CredentialInventoryStore } from './credential-inventory-store';
import InitializationHistory from './InitializationHistory';
import { MeliSprite } from '../marketing/MeliSprite';

export default function WalletOnboarding({ runtime, uid, english: en }: { runtime?: BrowserAuth; uid?: string; english: boolean }) {
  if (!runtime || !uid) return <><h1>{en ? 'Your GatoPago account' : 'Tu cuenta GatoPago'}</h1><p role="status">{en ? 'Sign in to continue creating your account.' : 'Inicia sesión para continuar creando tu cuenta.'}</p>
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
    <header className="mb-6 flex items-end gap-3"><div className="min-w-0 flex-1">
      <p className="meli-kicker mb-3">{en ? 'Welcome to GatoPago' : 'Bienvenido a GatoPago'}</p>
      <h1 id="wallet-setup-heading" className="font-display text-[32px]">{en ? 'Your account, under your control.' : 'Tu cuenta, bajo tu control.'}</h1>
      <p className="mt-3 text-sm text-text-muted">{en ? 'Your passkey is saved. We are preparing your account so you can receive and send.' : 'Tu passkey ya está guardada. Estamos preparando tu cuenta para recibir y enviar.'}</p>
    </div><MeliSprite variant="body-sitting" className="w-20 shrink-0" /></header>
    <p className="mb-4 text-[12px] text-text-muted">{en ? 'This is the same account you just registered, not a second account. Confirm its creation with your passkey.' : 'Es la misma cuenta que acabas de registrar, no otra cuenta. Confirma su creación con tu passkey.'}</p>
    {!pin ? <div className="auth-local" role="status"><p>{en ? 'Account activation is unavailable in this environment. Your access is saved. Return here when activation is available.' : 'La activación no está disponible en este entorno. Tu acceso está guardado. Puedes volver cuando la activación esté disponible.'}</p></div>
      : state.phase === 'loading' ? <p role="status">{en ? 'Checking your account…' : 'Comprobando tu cuenta…'}</p>
        : state.phase === 'ready' ? state.inventory.data.length > 0
          ? <InitializationHistory runtime={runtime} uid={uid} inventory={state.inventory} english={en} pin={pin} onActiveChange={setActive} />
          : <div role="status"><p>{en ? 'We could not find your access key. Review your access before continuing.' : 'No encontramos tu llave de acceso. Revisa tu acceso antes de continuar.'}</p>
            <NavigationLink href={localizedPath('/settings/security', en)} className="auth-secondary btn btn-ghost btn-block">{en ? 'Review my keys' : 'Revisar mis llaves'}</NavigationLink></div>
          : <div className="auth-error" role="alert"><p>{sessionError ? (en ? 'Your session or app version changed. Reload and sign in to resume.' : 'Tu sesión o versión de la app cambió. Recarga e inicia sesión para retomar.')
            : en ? 'We could not check your account. Your progress is saved; try again.' : 'No pudimos comprobar tu cuenta. Tu progreso está guardado; reintenta.'}</p>
            <button type="button" className="auth-secondary btn btn-ghost btn-block" onClick={() => sessionError ? reloadPage() : void store.load()}>{sessionError ? (en ? 'Reload' : 'Recargar') : en ? 'Retry' : 'Reintentar'}</button></div>}
    {!active ? <p className="mt-4 text-[12px] text-text-muted">{en ? 'You can close the app and resume this same process later.' : 'Puedes cerrar la app y retomar este mismo proceso después.'}</p> : null}
  </section>;
}
