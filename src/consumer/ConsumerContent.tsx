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
      <ActionCard href="/settings/security/recovery" english={en} title={en ? 'Access, backups and limits' : 'Acceso, respaldos y límites'} description={en ? 'Understand what happens if you lose your keys.' : 'Conoce qué ocurre si pierdes tus llaves.'} /></>;
    case 'account': return <>
      <h1 className="sr-only">{en ? 'My GatoPago account' : 'Mi cuenta GatoPago'}</h1>
      {runtime && identity ? <WalletOverview key={identity.uid} runtime={runtime} uid={identity.uid} english={en} /> : <BalanceCard balance={null} network="Arbitrum Sepolia" english={en} />}
      <div className="my-6 grid grid-cols-3 gap-2">{[
        ['/receive', en ? 'Receive' : 'Recibir', '↓'], ['/send', en ? 'Send' : 'Enviar', '↑'], ['/scan', en ? 'Scan' : 'Escanear', '▦'],
      ].map(([href, label, icon]) => <NavigationLink key={href} href={localizedPath(href, en)} className="meli-paper-card interactive-surface flex min-h-20 flex-col items-center justify-center gap-2 p-2 text-xs"><span aria-hidden="true" className="text-xl">{icon}</span>{label}</NavigationLink>)}</div>
      <ActionCard href="/move" english={en} title={en ? 'Move your money' : 'Mueve tu dinero'} description={en ? 'Receive or send.' : 'Recibe o envía.'} />
      <ActionCard href="/statement" english={en} title={en ? 'Check a transfer' : 'Consultar un envío'} description={en ? 'Use its reference to check the result and receipt.' : 'Usa su referencia para consultar el resultado y comprobante.'} />
    </>;
    case 'send': return <><BackHeader title={en ? 'Send money' : 'Enviar dinero'} english={en} to="/move" /><RecipientNotice english={en} />
      <NavigationLink href={localizedPath('/scan', en)} className="btn btn-ghost btn-block mb-5">{en ? 'Scan QR' : 'Escanear QR'}</NavigationLink>
      {runtime && identity ? <WalletOverview key={identity.uid} runtime={runtime} uid={identity.uid} english={en} mode="send" /> : <Panel><IntegrationNotice english={en} identityOnly /><p>{en ? 'Choose a verified V3 account and balance before reviewing a transfer.' : 'Elige una cuenta y saldo V3 verificados antes de revisar un envío.'}</p></Panel>}
    </>;
    case 'activity': return <><BackHeader title={en ? 'Check a transfer' : 'Consultar un envío'} english={en} />
      <p className="mb-5 text-sm">{en ? 'Enter the reference from your send confirmation. This is a transfer lookup, not a complete account history.' : 'Ingresa la referencia de tu confirmación de envío. Esta es una consulta de un envío, no un historial completo de la cuenta.'}</p>
      {runtime && identity ? <WalletOverview key={identity.uid} runtime={runtime} uid={identity.uid} english={en} mode="activity" /> : <Panel><IntegrationNotice english={en} identityOnly /></Panel>}
    </>;
  }
}

function RecipientNotice({ english: en }: { english: boolean }) {
  const params = useSearchParams(), recipient = params.get('recipient');
  if (!recipient || !/^0x[a-fA-F0-9]{40}$/.test(recipient)) return null;
  return <Panel><p className="mb-2 text-sm">{en ? 'Scanned recipient — verify before sending' : 'Destinatario escaneado — verifica antes de enviar'}</p><p className="break-all font-mono text-xs">{recipient}</p><p className="mt-3 text-sm text-text-muted">{en ? 'Only the address may prefill the form. An explicit network from the QR must match the selected account.' : 'Sólo la dirección puede completar el formulario. Una red explícita en el QR debe coincidir con la cuenta elegida.'}</p></Panel>;
}
