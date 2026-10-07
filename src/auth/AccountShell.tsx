'use client';

import {
  createContext,
  lazy,
  Suspense,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ConsumerFrame } from '../consumer/ConsumerFrame';
import { useNavigationRecord } from '../consumer/history';
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
  const params = useSearchParams();
  const en = params.get('lang') === 'en';
  const search = params.toString();
  // The session lives in this browser: unknown while rendering on the server.
  const session = useSyncExternalStore(subscribeSession, currentSession, () => undefined);
  const direction = useNavigationRecord();
  const signedOutOnArrival = useRef<boolean | null>(null);
  useEffect(() => {
    if (session === undefined) return;
    signedOutOnArrival.current ??= session === null;
    if (session !== null) return;
    const login = new URLSearchParams(en ? { lang: 'en' } : {});
    // A link opened signed out (a send to @someone) continues there after signing in; signing out
    // from the app does not bring the member back to where they left.
    if (signedOutOnArrival.current && pathname !== '/app')
      login.set('next', search ? `${pathname}?${search}` : pathname);
    router.replace(login.size ? `/login?${login}` : '/login');
  }, [session, router, en, pathname, search]);

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
          account={{
            networks: settings.networks,
            businessOrigin: settings.businessOrigin,
          }}
        >
          {/* Keyed by screen: it slides in from where the member is going while the frame stays. */}
          <div key={pathname} className="auth-content screen-enter" data-direction={direction}>
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
