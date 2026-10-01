'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { WebAuthConfig, EnabledAuthConfig } from './config';
import type { BrowserAuth, Identity } from './browser';
import dynamic from 'next/dynamic';
import './auth.css';
import { ConsumerFrame } from '../consumer/ConsumerFrame';
import { ConsumerContent } from '../consumer/ConsumerContent';
import type { ConsumerView } from '../consumer/routes';
import { IntegrationNotice } from '../consumer/Primitives';

const PasskeyAccess = dynamic(() => import('./PasskeyAccess').then(module => module.PasskeyAccess));

export function AuthScreen({ config, view, art, english = false }: {
  config: WebAuthConfig; view: ConsumerView; art: ReactNode; english?: boolean;
}) {
  if (config.mode === 'disabled' && view !== 'login') return <ConsumerFrame english={english} navigation><div className="auth-content"><IntegrationNotice english={english} identityOnly /><ConsumerContent view={view} english={english} /></div></ConsumerFrame>;
  if (config.mode === 'disabled') return <ConsumerFrame english={english}><div className="auth-content">
    {art ? <div className="auth-art">{art}</div> : null}
    <h1>{english ? 'V3 sign-in is not enabled yet' : 'El acceso V3 todavía no está habilitado'}</h1>
    <p>{english ? 'This environment has no provisioned identity service. No account or key has been created.' : 'Este ambiente aún no tiene su servicio de identidad configurado. No se creó ninguna cuenta ni llave.'}</p>
    <p>{english ? 'Do not send funds to test this version.' : 'No envíes fondos para probar esta versión.'}</p>
    <a className="auth-secondary" href={english ? '/en' : '/'}>{english ? 'Back to GatoPago' : 'Volver a GatoPago'}</a>
  </div></ConsumerFrame>;
  return <EnabledAuthScreen config={config} view={view} art={art} english={english} />;
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
  return <ConsumerFrame english={en} navigation={!!runtime && !!user && view !== 'login'}><div className="auth-content">
    {art && view === 'login' ? <div className="auth-art">{art}</div> : null}
    {view === 'login' ? <><h1>{en ? 'Your GatoPago account' : 'Tu cuenta GatoPago'}</h1>
      <p>{en ? 'Sign in with your passkey. Payments require their own confirmation.' : 'Entra con tu passkey. Los pagos requieren su propia confirmación.'}</p></> : null}
    {error ? <div className="auth-error" role="alert"><p>{en ? 'The session could not be confirmed. Reload to check it.' : 'No se pudo confirmar la sesión. Recarga para comprobarla.'}</p>
      <button onClick={() => window.location.reload()}>{en ? 'Reload' : 'Recargar'}</button></div> : !runtime ? <p role="status">{en ? 'Loading…' : 'Cargando…'}</p> : null}
    {runtime && user ? <section>
      {view === 'login' ? <a className="auth-primary" href={`/app${suffix}`}>{en ? 'Continue to my account' : 'Continuar a mi cuenta'}</a>
        : <ConsumerContent key={`${user.uid}:${view}`} view={view} english={en} identity={user} runtime={config.mode === 'firebase' ? runtime : undefined} />}
      {view === 'settings' || view === 'login' ? <button className="auth-secondary" disabled={busy} onClick={() => {
        setBusy(true); void runtime.logout().then(() => router.replace(`/login${suffix}`)).catch(() => setError(true)).finally(() => setBusy(false));
      }}>{en ? 'Sign out' : 'Cerrar sesión'}</button> : null}
    </section> : null}
    {runtime && !user && view === 'login' ? <PasskeyAccess runtime={runtime} config={config} english={en} onSignedIn={() => router.replace(`/app${suffix}`)} /> : null}
    {runtime && !user && view !== 'login' ? <a className="auth-primary" href={`/login${suffix}`}>{en ? 'Sign in to see your account' : 'Entra para ver tu cuenta'}</a> : null}
    <footer><a href={en ? '/en' : '/'}>{en ? 'Back to GatoPago' : 'Volver a GatoPago'}</a></footer>
  </div></ConsumerFrame>;
}
