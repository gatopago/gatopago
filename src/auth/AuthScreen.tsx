'use client';

import { NavigationLink } from '../consumer/NavigationLink';

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { WebAuthConfig, EnabledAuthConfig } from './config';
import type { BrowserAuth, Identity } from './browser';
import dynamic from 'next/dynamic';
import { ConsumerFrame } from '../consumer/ConsumerFrame';
import type { ConsumerView } from '../consumer/routes';
import { isReloadBlocked, reloadPage, serverReloadBlocked, subscribeReloadGuard } from '../pwa/reload-guard';

const PasskeyAccess = dynamic(() => import('./PasskeyAccess').then(module => module.PasskeyAccess));
const ConsumerContent = dynamic(() => import('../consumer/ConsumerContent').then(module => module.ConsumerContent));

export function AuthScreen({ config, view, art, english = false }: {
  config: WebAuthConfig; view: ConsumerView; art: ReactNode; english?: boolean;
}) {
  if (config.mode === 'disabled' && view !== 'login') return <LoginRedirect english={english} />;
  if (config.mode === 'disabled') return <ConsumerFrame english={english} presentation="access"><AuthContent art={art} english={english} login>
    <h2>{english ? 'Sign-in is not available yet' : 'El acceso todavía no está disponible'}</h2>
    <p>{english ? 'This environment has no provisioned identity service. No account or key has been created.' : 'Este ambiente aún no tiene su servicio de identidad configurado. No se creó ninguna cuenta ni llave.'}</p>
    <p>{english ? 'Do not send funds to test this version.' : 'No envíes fondos para probar esta versión.'}</p>
  </AuthContent></ConsumerFrame>;
  return <EnabledAuthScreen config={config} view={view} art={art} english={english} />;
}

function LoginRedirect({ english: en }: { english: boolean }) {
  const router = useRouter();
  const blocked = useSyncExternalStore(subscribeReloadGuard, isReloadBlocked, serverReloadBlocked);
  const destination = en ? '/login?lang=en' : '/login';
  useEffect(() => {
    // Do not interrupt an operation still protected by the navigation guard.
    if (!blocked) router.replace(destination);
  }, [blocked, destination, router]);
  return <ConsumerFrame english={en} presentation="access"><p role="status">
    {blocked
      ? en ? 'Waiting for the current operation to finish…' : 'Esperando a que termine la operación actual…'
      : en ? 'Opening sign-in…' : 'Abriendo el acceso…'}
  </p></ConsumerFrame>;
}

function AuthContent({ children, art, english: en, login }: { children: ReactNode; art: ReactNode; english: boolean; login: boolean }) {
  if (!login) return <div className="auth-content">{children}</div>;
  return <div className="auth-content auth-content--login"><div className="auth-login-grid">
    <div className="auth-login-hero">
      {art ? <figure className="auth-art" aria-hidden="true"><span className="auth-art__pixels" />{art}</figure> : null}
      <h1>{en ? 'Sign in or create an account' : 'Iniciar sesión o crear cuenta'}</h1>
      <p className="auth-tagline">{en ? <>Your dollars already know <span>how to move.</span></> : <>Tus dólares ya saben <span>moverse.</span></>}</p>
      <p className="auth-description">{en ? 'Sign in to your account or create a new one in a few steps.' : 'Entra a tu cuenta o crea una nueva en unos pasos.'}</p>
    </div>
    <div className="auth-login-copy">{children}</div>
  </div></div>;
}

function EnabledAuthScreen({ config, view, art, english: en }: {
  config: EnabledAuthConfig; view: ConsumerView; art: ReactNode; english: boolean;
}) {
  const router = useRouter();
  const [runtime, setRuntime] = useState<BrowserAuth | null>(null);
  const [user, setUser] = useState<Identity | null>(null);
  const [error, setError] = useState(false), [busy, setBusy] = useState(false);
  const suffix = en ? '?lang=en' : '';
  useEffect(() => {
    let alive = true, unsubscribe: (() => void) | undefined;
    const timer = window.setTimeout(() => { if (alive) setError(true); }, 15_000);
    void import('./browser').then(async ({ getBrowserAuth }) => {
      const client = getBrowserAuth(config); await client.ready;
      if (!alive) return;
      window.clearTimeout(timer); setRuntime(client); setUser(client.current()); setError(false);
      unsubscribe = client.subscribe(next => { if (alive) setUser(next); });
    }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; unsubscribe?.(); window.clearTimeout(timer); };
  }, [config]);
  if (runtime && !user && view !== 'login') return <LoginRedirect english={en} />;
  return <ConsumerFrame english={en} navigation={!!runtime && !!user && view !== 'login' && view !== 'onboarding'} presentation={view === 'login' ? 'access' : 'account'}><AuthContent art={art} english={en} login={view === 'login'}>
    {error ? <div className="auth-error" role="alert"><p>{en ? 'The session could not be confirmed. Reload to check it.' : 'No se pudo confirmar la sesión. Recarga para comprobarla.'}</p>
      <button className="auth-secondary btn btn-ghost btn-block" onClick={() => reloadPage()}>{en ? 'Reload' : 'Recargar'}</button></div> : !runtime ? <p role="status">{en ? 'Loading…' : 'Cargando…'}</p> : null}
    {runtime && user ? <section>
      {view === 'login' ? <NavigationLink className="auth-primary btn btn-primary btn-block" href={`/app${suffix}`}>{en ? 'Continue to my account' : 'Continuar a mi cuenta'}</NavigationLink>
        : <ConsumerContent key={`${user.uid}:${view}`} view={view} english={en} identity={user} runtime={config.mode === 'firebase' ? runtime : undefined} />}
      {view === 'settings' || view === 'login' ? <button className="auth-secondary btn btn-ghost btn-block" disabled={busy} onClick={() => {
        setBusy(true); void runtime.logout().then(() => router.replace(`/login${suffix}`)).catch(() => setError(true)).finally(() => setBusy(false));
      }}>{en ? 'Sign out' : 'Cerrar sesión'}</button> : null}
    </section> : null}
    {/* Firebase can publish the user before registration resolves. Keep the callback mounted until it redirects. */}
    {runtime && view === 'login' ? <div hidden={!!user}><PasskeyAccess runtime={runtime} config={config} english={en}
      onSignedIn={() => router.replace(`/app${suffix}`)} onRegistered={() => router.replace(`/onboarding${suffix}`)} /></div> : null}
  </AuthContent></ConsumerFrame>;
}
