'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ConsumerFrame } from '../consumer/ConsumerFrame';
import { NavigationLink } from '../consumer/NavigationLink';
import type { ClientSettings } from '../lib/settings';
import { currentSession, signOut, subscribeSession } from '../wallet/session';
import { PasskeyAccess } from './PasskeyAccess';
import { ScreenLoading } from '../consumer/Skeleton';

/** `/login`: sign in or create an account with a passkey. The signed-in app is `AccountShell`. */
export function AuthScreen({
  settings,
  art,
  english: en = false,
}: {
  settings: ClientSettings;
  view: 'login';
  art: ReactNode;
  english?: boolean;
}) {
  const router = useRouter();
  // The session lives in this browser: unknown while rendering on the server.
  const session = useSyncExternalStore(subscribeSession, currentSession, () => undefined);
  const suffix = en ? '?lang=en' : '';
  return (
    <ConsumerFrame english={en} presentation="access">
      <AccessContent art={art} english={en}>
        {session === undefined ? (
          <ScreenLoading kind="form" english={en} />
        ) : session ? (
          <section>
            <NavigationLink
              className="auth-primary btn btn-primary btn-block"
              href={`/app${suffix}`}
            >
              {en ? 'Continue to my account' : 'Continuar a mi cuenta'}
            </NavigationLink>
            <button className="auth-secondary btn btn-ghost btn-block" onClick={signOut}>
              {en ? 'Sign out' : 'Cerrar sesión'}
            </button>
          </section>
        ) : (
          <PasskeyAccess
            settings={settings}
            english={en}
            onSignedIn={(path) => router.replace(`${path}${suffix}`)}
          />
        )}
      </AccessContent>
    </ConsumerFrame>
  );
}

function AccessContent({
  children,
  art,
  english: en,
}: {
  children: ReactNode;
  art: ReactNode;
  english: boolean;
}) {
  return (
    <div className="auth-content auth-content--login">
      <div className="auth-login-grid">
        <div className="auth-login-hero">
          {art ? (
            <figure className="auth-art" aria-hidden="true">
              <span className="auth-art__pixels" />
              {art}
            </figure>
          ) : null}
          <h1>{en ? 'Sign in or create an account' : 'Iniciar sesión o crear cuenta'}</h1>
          <p className="auth-tagline">
            {en ? (
              <>
                Your dollars already know <span>how to move.</span>
              </>
            ) : (
              <>
                Tus dólares ya saben <span>moverse.</span>
              </>
            )}
          </p>
          <p className="auth-description">
            {en
              ? 'Sign in to your account or create a new one in a few steps.'
              : 'Entra a tu cuenta o crea una nueva en unos pasos.'}
          </p>
        </div>
        <div className="auth-login-copy">{children}</div>
      </div>
    </div>
  );
}
