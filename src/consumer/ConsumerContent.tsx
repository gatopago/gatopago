'use client';

import dynamic from 'next/dynamic';
import type { ClientSettings } from '../lib/settings';
import { Home } from '../wallet/Home';
import type { Session } from '../wallet/session';
import { AccountSettings } from './AccountSettings';
import { SecurityIcon } from './Icons';
import { MoveMenu } from './MoveMenu';
import { ActionCard, BackHeader } from './Primitives';
import type { ConsumerView } from './routes';

const Send = dynamic(() => import('../wallet/Send').then((m) => m.Send));
const Receive = dynamic(() => import('../wallet/Profile').then((m) => m.Receive));
const Profile = dynamic(() => import('../wallet/Profile').then((m) => m.ProfileScreen));
const Security = dynamic(() => import('../wallet/Security').then((m) => m.Security));
const Recovery = dynamic(() => import('./AccountScreens').then((m) => m.RecoveryScreen));
const Scan = dynamic(() => import('./ScanScreen'));

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
      return <Scan english={en} />;
    case 'profile':
      return <Profile {...props} />;
    case 'settings':
      return <AccountSettings english={en} />;
    case 'recovery':
      return <Recovery english={en} />;
    case 'security':
      return (
        <>
          <BackHeader
            title={en ? 'Your security center' : 'Tu centro de seguridad'}
            english={en}
            to="/settings"
          />
          <Security {...props} />
          <ActionCard
            href="/settings/security/recovery"
            english={en}
            icon={<SecurityIcon />}
            title={en ? 'Access and backups' : 'Acceso y respaldos'}
            description={
              en
                ? 'Understand what happens if you lose your keys.'
                : 'Conoce qué ocurre si pierdes tus llaves.'
            }
          />
        </>
      );
  }
}
