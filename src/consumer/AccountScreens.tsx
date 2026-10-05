'use client';

import { useState } from 'react';
import { BackHeader, Panel } from './Primitives';
import { NavigationLink } from './NavigationLink';
import { localizedPath } from './routes';
import { MeliSprite } from '../marketing/MeliSprite';

export function RecoveryScreen({ english: en }: { english: boolean }) {
  const [details, setDetails] = useState(false);
  return (
    <>
      <BackHeader
        title={en ? 'Access and backup keys' : 'Acceso y llaves de respaldo'}
        english={en}
        to="/settings/security"
      />
      <p className="mb-6 leading-relaxed">
        {en
          ? 'First try your password manager or another device where you saved access.'
          : 'Primero intenta con tu gestor de contraseñas u otro dispositivo donde guardaste tu acceso.'}
      </p>
      <MeliSprite variant="head-cautious" className="mx-auto mb-6 w-20" />
      <Panel>
        <ol className="space-y-5">
          {(en
            ? [
                'Check your password manager and other devices.',
                'One authorized key is sufficient to spend and administer the account.',
                'If every authorized key is lost, access is lost permanently. GatoPago, support and email cannot reset it.',
              ]
            : [
                'Revisa tu gestor de contraseñas y otros dispositivos.',
                'Una llave autorizada basta para gastar y administrar la cuenta.',
                'Si pierdes todas las llaves autorizadas, pierdes el acceso definitivamente. GatoPago, soporte y el correo no pueden restablecerlo.',
              ]
          ).map((text, index) => (
            <li key={text} className="flex gap-4">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-text bg-cat-500 font-display"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <span>{text}</span>
            </li>
          ))}
        </ol>
      </Panel>
      <p className="mb-5 text-sm text-text-muted">
        {en
          ? 'Additional keys are optional and have the same authority; losing one does not disable the others.'
          : 'Las llaves adicionales son opcionales y tienen la misma autoridad; perder una no deshabilita las otras.'}
      </p>
      <NavigationLink
        href={localizedPath('/settings/security', en)}
        className="btn btn-primary btn-block"
      >
        {en ? 'Go to Security' : 'Ir a Seguridad'}
      </NavigationLink>
      <button
        type="button"
        className="btn btn-ghost btn-block mt-4"
        aria-expanded={details}
        onClick={() => setDetails((value) => !value)}
      >
        {en ? 'What if GatoPago is unavailable?' : '¿Y si GatoPago no está disponible?'}
      </button>
      {details ? (
        <Panel className="mt-5">
          <p className="text-sm">
            {en
              ? 'Your account and your funds are on the blockchain, not in GatoPago. Your key keeps signing, and any ERC-4337 service can send your operations, paying their network fee.'
              : 'Tu cuenta y tus fondos están en la blockchain, no en GatoPago. Tu llave sigue firmando, y cualquier servicio ERC-4337 puede enviar tus operaciones, pagando su comisión de red.'}
          </p>
        </Panel>
      ) : null}
    </>
  );
}
