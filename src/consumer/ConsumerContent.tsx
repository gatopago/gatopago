'use client';

import dynamic from 'next/dynamic';
import { lazy } from 'react';
import type { ClientSettings } from '../lib/settings';
import type { Session } from '../wallet/session';
import { MoveMenu } from './MoveMenu';
import type { ConsumerView } from './routes';
import { ScreenLoading } from './Skeleton';

const FormLoading = () => <ScreenLoading kind="form" />;
const DetailLoading = () => <ScreenLoading kind="detail" />;

// AccountShell's Suspense keeps the existing loading screen and its language.
const Home = lazy(() => import('../wallet/Home').then((m) => ({ default: m.Home })));
const AccountSettings = lazy(() =>
  import('./AccountSettings').then((m) => ({ default: m.AccountSettings })),
);
const Send = dynamic(() => import('../wallet/Send').then((m) => m.Send), { loading: FormLoading });
const Receive = dynamic(() => import('../wallet/Receive').then((m) => m.Receive), {
  loading: DetailLoading,
});
const Profile = dynamic(() => import('../wallet/Profile').then((m) => m.ProfileScreen), {
  loading: FormLoading,
});
const Security = dynamic(() => import('../wallet/Security').then((m) => m.Security), {
  loading: FormLoading,
});
const Recovery = dynamic(() => import('./AccountScreens').then((m) => m.RecoveryScreen), {
  loading: DetailLoading,
});
const Scan = dynamic(() => import('./ScanScreen'), { loading: DetailLoading });
const Earn = dynamic(() => import('./EarnScreen').then((m) => m.EarnScreen), {
  loading: FormLoading,
});
const Swap = dynamic(() => import('./SwapScreen').then((m) => m.SwapScreen), {
  loading: FormLoading,
});
const Activity = dynamic(() => import('./ActivityScreen').then((m) => m.ActivityScreen), {
  loading: DetailLoading,
});
const Charge = dynamic(() => import('./ChargeScreen').then((m) => m.ChargeScreen), {
  loading: FormLoading,
});
const Contacts = dynamic(() => import('./ContactsScreen').then((m) => m.ContactsScreen), {
  loading: DetailLoading,
});
const Business = dynamic(() => import('../business/Business').then((m) => m.Business), {
  loading: DetailLoading,
});
const Crosschain = dynamic(() => import('../wallet/Crosschain').then((m) => m.Crosschain), {
  loading: FormLoading,
});

export function ConsumerContent({
  view,
  english: en,
  settings,
  session,
}: {
  view: Exclude<ConsumerView, 'login'>;
  english: boolean;
  settings: ClientSettings;
  session: Session;
}) {
  const props = { english: en, settings, session };
  switch (view) {
    case 'account':
      return <Home {...props} />;
    case 'move':
      return <MoveMenu english={en} />;
    case 'send':
      return <Send {...props} />;
    case 'receive':
      return <Receive {...props} />;
    case 'scan':
      return <Scan {...props} />;
    case 'profile':
      return <Profile {...props} />;
    case 'earn':
      return <Earn {...props} />;
    case 'swap':
      return <Swap {...props} />;
    case 'statement':
      return <Activity {...props} />;
    case 'charge':
      return <Charge {...props} />;
    case 'contacts':
      return <Contacts {...props} />;
    case 'business':
      return <Business {...props} />;
    case 'crosschain':
      return <Crosschain {...props} />;
    case 'settings':
      return <AccountSettings {...props} />;
    case 'recovery':
      return <Recovery english={en} />;
    case 'security':
      return <Security {...props} />;
  }
}
