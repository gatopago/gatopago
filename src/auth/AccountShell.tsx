'use client';

import {
  createContext,
  lazy,
  Suspense,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ConsumerFrame } from '../consumer/ConsumerFrame';
import type { ConsumerView } from '../consumer/routes';
import { ScreenLoading } from '../consumer/Skeleton';
import type { ClientSettings } from '../lib/settings';
import { currentSession, subscribeSession, type Session } from '../wallet/session';
import { ProfileProvider } from '../wallet/useProfile';

const ConsumerContent = lazy(() =>
  import('../consumer/ConsumerContent').then((module) => ({ default: module.ConsumerContent })),
);

const AccountContext = createContext<{ settings: ClientSettings; session: Session } | null>(null);

/**
 * The signed-in app's layout: session, profile, header and navigation are mounted once and stay
 * while the member moves between screens; only the screen's content changes.
 */
export function AccountShell({
  settings,
  children,
}: {
  settings: ClientSettings;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const en = useSearchParams().get('lang') === 'en';
  // The session lives in this browser: unknown while rendering on the server.
  const session = useSyncExternalStore(subscribeSession, currentSession, () => undefined);
  useEffect(() => {
    if (session === null) router.replace(en ? '/login?lang=en' : '/login');
  }, [session, router, en]);

  if (!session)
    return (
      <ConsumerFrame english={en}>
        <div className="auth-content">
          <ScreenLoading kind={pathname === '/app' ? 'account' : 'form'} english={en} />
        </div>
      </ConsumerFrame>
    );

  return (
    <AccountContext value={{ settings, session }}>
      <ProfileProvider settings={settings} session={session} english={en}>
        <ConsumerFrame
          english={en}
          navigation
          account={{ address: session.wallet.address, networks: settings.networks }}
        >
          {/* Keyed by screen: the content enters gently while the frame stays put. */}
          <div key={pathname} className="auth-content animate-fade-in">
            {children}
          </div>
        </ConsumerFrame>
      </ProfileProvider>
    </AccountContext>
  );
}

/** A screen of the signed-in app, rendered inside `AccountShell`. */
export function AccountView({
  view,
  english,
}: {
  view: Exclude<ConsumerView, 'login'>;
  english: boolean;
}) {
  const account = useContext(AccountContext);
  if (!account) return null;
  return (
    <Suspense
      fallback={
        <ScreenLoading
          kind={view === 'account' ? 'account' : view === 'receive' ? 'detail' : 'form'}
          english={english}
        />
      }
    >
      <ConsumerContent view={view} english={english} {...account} />
    </Suspense>
  );
}
