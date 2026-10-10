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
import { useSearchParams } from 'next/navigation';
import { usePathname, useRouter } from '../i18n/navigation';
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
  const search = params.toString();
  // The session lives in this browser: unknown while rendering on the server.
  const session = useSyncExternalStore(subscribeSession, currentSession, () => undefined);
  const direction = useNavigationRecord();
  const signedOutOnArrival = useRef<boolean | null>(null);
  useEffect(() => {
    if (session === undefined) return;
    signedOutOnArrival.current ??= session === null;
    if (session !== null) return;
    // A link opened signed out (a send to @someone) continues there after signing in; signing out
    // from the app does not bring the member back to where they left.
    const next = signedOutOnArrival.current && pathname !== '/app';
    router.replace(
      next
        ? `/login?${new URLSearchParams({ next: search ? `${pathname}?${search}` : pathname })}`
        : '/login',
    );
  }, [session, router, pathname, search]);

  if (!session)
    return (
      <ConsumerFrame>
        <div className="auth-content">
          <ScreenLoading kind={pathname === '/app' ? 'account' : 'form'} />
        </div>
      </ConsumerFrame>
    );

  return (
    <AccountContext value={{ settings, session }}>
      {/*
       * Keyed by account: when another tab signs in with another account, nothing prepared for
       * the previous one (a review, a receipt, its profile) survives into the new one.
       */}
      <ProfileProvider
        key={session.wallet.address.toLowerCase()}
        settings={settings}
        session={session}
      >
        <ConsumerFrame
          navigation
          account={{
            address: session.wallet.address,
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
export function AccountView({ view }: { view: Exclude<ConsumerView, 'login'> }) {
  const account = useContext(AccountContext);
  if (!account) return null;
  return (
    <Suspense
      fallback={
        <ScreenLoading
          kind={view === 'account' ? 'account' : view === 'receive' ? 'detail' : 'form'}
        />
      }
    >
      <ConsumerContent view={view} {...account} />
    </Suspense>
  );
}
