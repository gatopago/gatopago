'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ConsumerFrame } from '../consumer/ConsumerFrame';
import { NavigationLink } from '../consumer/NavigationLink';
import { localizedPath, safeNext } from '../consumer/routes';
import type { ClientSettings } from '../lib/settings';
import { currentSession, signOut, subscribeSession } from '../wallet/session';
import { PasskeyAccess } from './PasskeyAccess';
import { ScreenLoading } from '../consumer/Skeleton';
import { useLocale, useTranslations } from 'next-intl';

/** `/login`: sign in or create an account with a passkey. The signed-in app is `AccountShell`. */
export function AuthScreen({
  settings,
  art,
}: {
  settings: ClientSettings;
  view: 'login';
  art: ReactNode;
}) {
  const t = useTranslations('Auth');
  const locale = useLocale();
  const router = useRouter();
  // The session lives in this browser: unknown while rendering on the server.
  const session = useSyncExternalStore(subscribeSession, currentSession, () => undefined);
  // Where the member was going: a payment or a send opened before signing in.
  const next = safeNext(useSearchParams().get('next'));
  return (
    <ConsumerFrame presentation="access">
      <AccessContent art={art}>
        {session === undefined ? (
          <ScreenLoading kind="form" bar={false} />
        ) : session ? (
          <section>
            <NavigationLink
              className="auth-primary btn btn-primary btn-block"
              href={next ?? localizedPath('/app', locale)}
            >
              {next ? t('continue') : t('continueMyAccount')}
            </NavigationLink>
            <button className="auth-secondary btn btn-ghost btn-block" onClick={signOut}>
              {t('signOut')}
            </button>
          </section>
        ) : (
          <PasskeyAccess
            settings={settings}
            onSignedIn={(path) =>
              router.replace(path === '/app' && next ? next : localizedPath(path, locale))
            }
          />
        )}
      </AccessContent>
    </ConsumerFrame>
  );
}

function AccessContent({ children, art }: { children: ReactNode; art: ReactNode }) {
  const t = useTranslations('Auth');
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
          <h1>{t('signGatopago')}</h1>
          <p className="auth-tagline">
            {t.rich('tagline', { accent: (chunks) => <span>{chunks}</span> })}
          </p>
          <p className="auth-description">{t('usePhonesFingerprintFace')}</p>
        </div>
        <div className="auth-login-copy">{children}</div>
      </div>
    </div>
  );
}
