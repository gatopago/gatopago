'use client';

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import type { BrowserAuth, Identity } from '../auth/browser';
import type { ConsumerView } from './routes';
import { WalletOverview } from '../wallet/WalletOverview';
import { AccountSettings } from './AccountSettings';
import { MoveMenu } from './MoveMenu';
import { BalanceCard } from './BalanceCard';
import { ActionCard, BackHeader, IntegrationNotice, Panel } from './Primitives';
import { NavigationLink } from './NavigationLink';
import { localizedPath } from './routes';
import { ReceiveIcon, SendIcon, ScanIcon, GrowIcon, MoveIcon, ActivityIcon, SecurityIcon } from './Icons';

const Security = dynamic(() => import('../wallet/SecurityEnrollment'), { ssr: false });
const Scan = dynamic(() => import('./ScanScreen'));
const Receive = dynamic(() => import('./PaymentScreens').then(m => m.ReceiveScreen));
const Profile = dynamic(() => import('./AccountScreens').then(m => m.ProfileScreen));
const Recovery = dynamic(() => import('./AccountScreens').then(m => m.RecoveryScreen));
const Onboarding = dynamic(() => import('../wallet/WalletOnboarding'));

/** Same route body for authenticated use and explicitly empty/unconfigured UI.
 * The latter never receives a fake identity/runtime or financial fixtures. */
export function ConsumerContent({ view, english: en, runtime, identity }: {
  view: Exclude<ConsumerView, 'login'>; english: boolean; runtime?: BrowserAuth; identity?: Identity;
}) {
  switch (view) {
    case 'settings': return <AccountSettings english={en} />;
    case 'move': return <MoveMenu english={en} />;
    case 'receive': return <Receive english={en} runtime={runtime} uid={identity?.uid} />;
    case 'profile': return <Profile key={identity?.uid ?? 'unconfigured'} english={en} runtime={runtime} uid={identity?.uid} />;
    case 'recovery': return <Recovery english={en} />;
    case 'onboarding': return <Onboarding english={en} runtime={runtime} uid={identity?.uid} />;
    case 'scan': return <Scan english={en} />;
    case 'security': return <><BackHeader title={en ? 'Your security center' : 'Tu centro de seguridad'} english={en} to="/settings" />
      {runtime && identity ? <Security key={identity.uid} runtime={runtime} uid={identity.uid} english={en} /> : <Panel><h2 className="mb-4 font-display text-xl">{en ? 'Your device protects your key' : 'Tu dispositivo protege tu llave'}</h2><p className="mb-4">{en ? 'Your fingerprint, face or PIN unlocks the key used to authorize operations.' : 'Tu huella, rostro o PIN desbloquea la llave que autoriza operaciones.'}</p><IntegrationNotice english={en} identityOnly /><p className="text-sm">{en ? 'Key inventory is unavailable. This does not mean you have no keys.' : 'El inventario de llaves no está disponible. Esto no significa que no tengas llaves.'}</p></Panel>}
      <ActionCard href="/settings/security/recovery" english={en} icon={<SecurityIcon />} title={en ? 'Access, backups and limits' : 'Acceso, respaldos y límites'} description={en ? 'Understand what happens if you lose your keys.' : 'Conoce qué ocurre si pierdes tus llaves.'} /></>;
    case 'account': return <>
      <h1 className="sr-only">{en ? 'My GatoPago account' : 'Mi cuenta GatoPago'}</h1>
      {runtime && identity ? <WalletOverview key={identity.uid} runtime={runtime} uid={identity.uid} english={en}><HomeActions english={en} /></WalletOverview>
        : <><BalanceCard balance={null} network="Arbitrum Sepolia" english={en} /><HomeActions english={en} /></>}
    </>;
    case 'send': return <><BackHeader title={en ? 'Send money' : 'Enviar dinero'} english={en} to="/move" /><RecipientNotice english={en} />
      <NavigationLink href={localizedPath('/scan', en)} className="btn btn-ghost btn-block mb-5">{en ? 'Scan QR' : 'Escanear QR'}</NavigationLink>
      {runtime && identity ? <WalletOverview key={identity.uid} runtime={runtime} uid={identity.uid} english={en} mode="send" /> : <Panel><IntegrationNotice english={en} identityOnly /><p>{en ? 'Choose a verified V3 account and balance before reviewing a transfer.' : 'Elige una cuenta y saldo V3 verificados antes de revisar un envío.'}</p></Panel>}
    </>;
    case 'activity': return <><BackHeader title={en ? 'Check a transfer' : 'Consultar un envío'} english={en} />
      <p className="mb-5 text-sm">{en ? 'Enter the reference from your send confirmation. This is a transfer lookup, not a complete account history.' : 'Ingresa la referencia de tu confirmación de envío. Esta es una consulta de un envío, no un historial completo de la cuenta.'}</p>
      {runtime && identity ? <WalletOverview key={identity.uid} runtime={runtime} uid={identity.uid} english={en} mode="activity" /> : <Panel><IntegrationNotice english={en} identityOnly /></Panel>}
    </>;
    case 'grow': return <><BackHeader title={en ? 'Grow' : 'Crecer'} english={en} />
      <p className="mb-5 text-sm">{en ? 'Manage your own USDC position in Aave on Arbitrum Sepolia.' : 'Gestiona tu propia posición USDC en Aave sobre Arbitrum Sepolia.'}</p>
      {runtime && identity ? <WalletOverview key={identity.uid} runtime={runtime} uid={identity.uid} english={en} mode="grow" /> : <Panel><IntegrationNotice english={en} identityOnly /></Panel>}
    </>;
  }
}

function HomeActions({ english: en }: { english: boolean }) {
  const actions = [
    { href: '/receive', label: en ? 'Receive' : 'Recibir', icon: ReceiveIcon },
    { href: '/send', label: en ? 'Send' : 'Enviar', icon: SendIcon },
    { href: '/grow', label: en ? 'Grow' : 'Crecer', icon: GrowIcon },
    { href: '/scan', label: en ? 'Scan' : 'Escanear', icon: ScanIcon },
  ];
  return <><div className="meli-quick-grid my-6">{actions.map(item =>
    <NavigationLink key={item.href} href={localizedPath(item.href, en)} className="meli-quick-action interactive-surface"><span><item.icon /></span><span>{item.label}</span></NavigationLink>)}</div>
    <ActionCard href="/move" english={en} icon={<MoveIcon />} title={en ? 'Move your money' : 'Mueve tu dinero'} description={en ? 'Choose your next step.' : 'Elige tu próximo movimiento.'} />
    <ActionCard href="/statement" english={en} icon={<ActivityIcon />} title={en ? 'Check a transfer' : 'Consultar un envío'} description={en ? 'Check its status and receipt using the transfer reference.' : 'Consulta el estado y comprobante con la referencia del envío.'} />
  </>;
}

function RecipientNotice({ english: en }: { english: boolean }) {
  const params = useSearchParams(), recipient = params.get('recipient');
  if (!recipient || !/^0x[a-fA-F0-9]{40}$/.test(recipient)) return null;
  return <Panel><p className="mb-2 text-sm">{en ? 'Scanned recipient — verify before sending' : 'Destinatario escaneado — verifica antes de enviar'}</p><p className="break-all font-mono text-xs">{recipient}</p><p className="mt-3 text-sm text-text-muted">{en ? 'Only the address may prefill the form. An explicit network from the QR must match the selected account.' : 'Sólo la dirección puede completar el formulario. Una red explícita en el QR debe coincidir con la cuenta elegida.'}</p></Panel>;
}
