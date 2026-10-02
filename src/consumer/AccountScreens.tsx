'use client';

import { useState } from 'react';
import type { BrowserAuth } from '../auth/browser';
import { ProfileEditor } from './ProfileEditor';
import { BackHeader, IntegrationNotice, Panel } from './Primitives';
import { NavigationLink } from './NavigationLink';
import { localizedPath } from './routes';

export function ProfileScreen({ english: en, runtime, uid }: { english: boolean; runtime?: BrowserAuth; uid?: string }) {
  return <><BackHeader title={en ? 'My profile' : 'Mi perfil'} english={en} to="/settings" />
    {runtime && uid ? <ProfileEditor key={uid} runtime={runtime} uid={uid} english={en} />
      : <Panel><IntegrationNotice english={en} identityOnly /></Panel>}
  </>;
}

export function RecoveryScreen({ english: en }: { english: boolean }) {
  const [details, setDetails] = useState(false);
  return <><BackHeader title={en ? 'Access and backup keys' : 'Acceso y llaves de respaldo'} english={en} to="/settings/security" />
    <p className="mb-6 leading-relaxed">{en ? 'First try an existing key, including a synchronized passkey or another device.' : 'Primero intenta con una llave existente, incluida una passkey sincronizada u otro dispositivo.'}</p>
    <Panel><ol className="space-y-5">{(en ? ['Check your password manager and other devices.', 'One authorized key is sufficient to spend and administer the account.', 'If every authorized key is lost, access is lost permanently. GatoPago, support and email cannot reset it.'] : ['Revisa tu gestor de contraseñas y otros dispositivos.', 'Una llave autorizada basta para gastar y administrar la cuenta.', 'Si pierdes todas las llaves autorizadas, pierdes el acceso definitivamente. GatoPago, soporte y el correo no pueden restablecerlo.']).map((text, index) => <li key={text} className="flex gap-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-text bg-cat-500 font-display" aria-hidden="true">{index + 1}</span><span>{text}</span></li>)}</ol></Panel>
    <p className="mb-5 text-sm text-text-muted">{en ? 'Additional keys are optional and have the same authority; losing one does not disable the others.' : 'Las llaves adicionales son opcionales y tienen la misma autoridad; perder una no deshabilita las otras.'}</p>
    <NavigationLink href={localizedPath('/settings/security', en)} className="btn btn-primary btn-block">{en ? 'Go to Security' : 'Ir a Seguridad'}</NavigationLink>
    <button type="button" className="btn btn-ghost btn-block mt-4" aria-expanded={details} onClick={() => setDetails(value => !value)}>{en ? 'What if GatoPago is unavailable?' : '¿Y si GatoPago no está disponible?'}</button>
    {details ? <Panel className="mt-5"><p className="text-sm">{en ? 'Independent access requires a verified V3 exit package and an authorized signer. This interface cannot export a passkey private key from your password manager. Independent access is not connected in this app yet.' : 'El acceso independiente requiere un paquete de salida V3 verificado y un firmante autorizado. Esta interfaz no puede exportar la clave privada de una passkey desde tu gestor. El acceso independiente aún no está conectado en esta app.'}</p></Panel> : null}
  </>;
}
