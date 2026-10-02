'use client';

import { useState } from 'react';
import type { BrowserAuth } from '../auth/browser';
import { ProfileEditor } from './ProfileEditor';
import { BackHeader, Field, IntegrationNotice, Panel, UnavailableAction } from './Primitives';
import { NavigationLink } from './NavigationLink';
import { localizedPath } from './routes';

const field = 'meli-field h-12 w-full px-3 text-[14px]';

export function ProfileScreen({ english: en, runtime, uid }: { english: boolean; runtime?: BrowserAuth; uid?: string }) {
  return <><BackHeader title={en ? 'My profile' : 'Mi perfil'} english={en} to="/settings" />
    {runtime && uid ? <ProfileEditor key={uid} runtime={runtime} uid={uid} english={en} />
      : <Panel><IntegrationNotice english={en} /><UnavailableAction>{en ? 'Save profile' : 'Guardar perfil'}</UnavailableAction></Panel>}
  </>;
}

export function ContactsScreen({ english: en }: { english: boolean }) {
  const [search, setSearch] = useState(''), [adding, setAdding] = useState(false);
  const [name, setName] = useState(''), [address, setAddress] = useState('');
  return <><BackHeader title={en ? 'Contacts' : 'Contactos'} english={en} /><IntegrationNotice english={en} />
    <Field label={en ? 'Search contacts' : 'Buscar contactos'}>{id => <input id={id} type="search" value={search} onChange={event => setSearch(event.target.value)} className={field} />}</Field>
    <Panel><p className="text-sm text-text-muted">{en ? 'Your contact list has not been loaded. This does not mean you have no contacts.' : 'No se cargó tu lista de contactos. Esto no significa que no tengas contactos.'}</p></Panel>
    <button type="button" className="btn btn-primary btn-block" aria-expanded={adding} onClick={() => setAdding(value => !value)}>{adding ? en ? 'Close form' : 'Cerrar formulario' : en ? 'Add contact' : 'Agregar contacto'}</button>
    {adding ? <form className="mt-6" onSubmit={event => event.preventDefault()}><Panel>
      <Field label={en ? 'Name' : 'Nombre'}>{id => <input id={id} value={name} maxLength={60} onChange={event => setName(event.target.value)} autoComplete="off" className={field} />}</Field>
      <Field label={en ? 'Address or username' : 'Dirección o usuario'}>{id => <input id={id} value={address} maxLength={80} onChange={event => setAddress(event.target.value)} spellCheck={false} autoComplete="off" className={field} />}</Field>
      <UnavailableAction>{en ? 'Save contact' : 'Guardar contacto'}</UnavailableAction>
    </Panel></form> : null}
  </>;
}

export function RecoveryScreen({ english: en }: { english: boolean }) {
  const [details, setDetails] = useState(false);
  return <><BackHeader title={en ? 'Access and backup keys' : 'Acceso y llaves de respaldo'} english={en} to="/settings/security" />
    <p className="mb-6 leading-relaxed">{en ? 'First try an existing key, including a synchronized passkey or another device. Signing in by email does not replace your account keys.' : 'Primero intenta con una llave existente, incluida una passkey sincronizada u otro dispositivo. Entrar por correo no reemplaza las llaves de tu cuenta.'}</p>
    <Panel><ol className="space-y-5">{(en ? ['Check your password manager and other devices.', 'One authorized key is sufficient to spend and administer the consumer account.', 'If every authorized key is lost, access is lost permanently. GatoPago, support and email cannot reset it.'] : ['Revisa tu gestor de contraseñas y otros dispositivos.', 'Una llave autorizada basta para gastar y administrar la cuenta consumer.', 'Si pierdes todas las llaves autorizadas, pierdes el acceso definitivamente. GatoPago, soporte y el correo no pueden restablecerlo.']).map((text, index) => <li key={text} className="flex gap-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-text bg-cat-500 font-display" aria-hidden="true">{index + 1}</span><span>{text}</span></li>)}</ol></Panel>
    <p className="mb-5 text-sm text-text-muted">{en ? 'V3.0 has no separate recovery protocol or recovery waiting period. Backups are optional keys with the same authority; losing one does not disable the others.' : 'V3.0 no tiene un protocolo separado de recuperación ni una espera de recuperación. Los respaldos son llaves opcionales con la misma autoridad; perder una no deshabilita las otras.'}</p>
    <NavigationLink href={localizedPath('/settings/security', en)} className="btn btn-primary btn-block">{en ? 'Go to Security' : 'Ir a Seguridad'}</NavigationLink>
    <button type="button" className="btn btn-ghost btn-block mt-4" aria-expanded={details} onClick={() => setDetails(value => !value)}>{en ? 'What if GatoPago is unavailable?' : '¿Y si GatoPago no está disponible?'}</button>
    {details ? <Panel className="mt-5"><p className="text-sm">{en ? 'Independent access requires a verified V3 exit package and an authorized signer. This interface cannot export a passkey private key from your password manager. The consumer exit flow is not connected yet.' : 'El acceso independiente requiere un paquete de salida V3 verificado y un firmante autorizado. Esta interfaz no puede exportar la clave privada de una passkey desde tu gestor. El recorrido de salida consumer aún no está conectado.'}</p></Panel> : null}
  </>;
}

export function OnboardingScreen({ english: en }: { english: boolean }) {
  return <><BackHeader title={en ? 'Set up your account' : 'Configura tu cuenta'} english={en} />
    <Panel><h2 className="mb-3 font-display text-xl">{en ? 'Your identity and your keys are separate' : 'Tu identidad y tus llaves son distintas'}</h2><p className="text-sm leading-relaxed">{en ? 'Google or email gives you access to the app. In Security you can review and explicitly create a V3 key and account when this environment is ready.' : 'Google o tu correo te dan acceso a la app. En Seguridad puedes revisar y crear explícitamente una llave y cuenta V3 cuando este ambiente esté listo.'}</p></Panel>
    <NavigationLink href={localizedPath('/settings/security', en)} className="btn btn-primary btn-block">{en ? 'Go to Security' : 'Ir a Seguridad'}</NavigationLink>
    <NavigationLink href={localizedPath('/profile', en)} className="btn btn-ghost btn-block mt-4">{en ? 'Review my profile' : 'Revisar mi perfil'}</NavigationLink>
  </>;
}

export function TestFundsScreen({ english: en }: { english: boolean }) {
  return <><BackHeader title={en ? 'Test funds' : 'Fondos de prueba'} english={en} /><Panel><p className="meli-kicker mb-4">Arbitrum Sepolia</p>
    <p className="mb-4">{en ? 'Testnet tokens have no real monetary value.' : 'Los tokens de testnet no tienen valor monetario real.'}</p><IntegrationNotice english={en} />
    <p className="text-sm text-text-muted">{en ? 'A faucet request requires a verified V3 destination. No request was sent.' : 'Solicitar fondos requiere un destino V3 verificado. No se envió ninguna solicitud.'}</p>
    <UnavailableAction>{en ? 'Request test funds' : 'Solicitar fondos de prueba'}</UnavailableAction>
  </Panel></>;
}
