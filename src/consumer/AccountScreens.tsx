'use client';

import type { ReactNode } from 'react';
import { BackHeader, Panel } from './Primitives';
import { NavigationLink } from './NavigationLink';
import { localizedPath } from './routes';
import { MeliSprite } from '../marketing/MeliSprite';

/** `/settings/security/recovery`: how keys work, what to do if one is lost, and the questions. */
export function RecoveryScreen({ english: en }: { english: boolean }) {
  return (
    <>
      <BackHeader
        title={en ? 'How keys work' : 'Cómo funcionan las llaves'}
        english={en}
        to="/settings/security"
      />
      <MeliSprite variant="head-cautious" className="mx-auto mb-6 w-20" />
      <Panel>
        <ol className="space-y-5">
          {(en
            ? [
                'Check your password manager and other devices.',
                'One authorized key is enough to spend from and manage the account.',
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
      <h2 className="meli-kicker mb-3 px-1">
        {en ? 'Frequently asked questions' : 'Preguntas frecuentes'}
      </h2>
      <div className="meli-paper-card meli-paper-card--strong divide-y divide-border px-5 py-2">
        <Faq question={en ? 'What is your access key?' : '¿Qué es tu llave de acceso?'}>
          <p>
            {en
              ? 'It is like your house key, but digital: your device or password manager keeps it, and you open it with your fingerprint, face or PIN. There is no GatoPago password to steal or forget.'
              : 'Es como la llave de tu casa, pero digital: la guarda tu dispositivo o tu gestor de contraseñas, y la abres con tu huella, tu rostro o tu PIN. No hay una contraseña de GatoPago que robar ni olvidar.'}
          </p>
          <p>
            {en
              ? 'Each payment is authorized with a signature made by that key. You can have several (phone, computer), all with the same authority; losing one does not disable the others.'
              : 'Cada pago se autoriza con una firma creada por esa llave. Puedes tener varias (teléfono, computadora), todas con la misma autoridad; perder una no deshabilita las otras.'}
          </p>
        </Faq>
        <Faq question={en ? 'What if I lose my phone?' : '¿Qué pasa si pierdo mi teléfono?'}>
          <p>
            {en
              ? 'If you saved the passkey in Google Password Manager, it can appear on Android, Chrome and iOS when Google is enabled as a manager. If you saved it in iCloud, it syncs across your Apple devices.'
              : 'Si guardaste la passkey en Google Password Manager, puede aparecer en Android, Chrome y también en iOS cuando Google está habilitado como gestor. Si la guardaste en iCloud, se sincroniza entre tus dispositivos Apple.'}
          </p>
          <p>
            {en
              ? 'Without any other key, access cannot be recovered: nobody, not even GatoPago, can reset it. That is why a backup key matters: '
              : 'Sin otra llave, el acceso no se puede recuperar: nadie, ni siquiera GatoPago, puede restablecerlo. Por eso importa tener una llave de respaldo: '}
            <NavigationLink
              href={localizedPath('/settings/security', en)}
              className="font-semibold text-cat-700 underline underline-offset-2"
            >
              {en ? 'add one in Security' : 'agrégala en Seguridad'}
            </NavigationLink>
            .
          </p>
        </Faq>
        <Faq
          question={
            en
              ? 'What can GatoPago do with my account?'
              : '¿Qué puede hacer GatoPago con mi cuenta?'
          }
        >
          <p>
            {en
              ? 'GatoPago does not hold your keys and cannot sign movements. It only pays the network fee of your operations.'
              : 'GatoPago no posee tus llaves ni puede firmar movimientos. Solo paga la comisión de red de tus operaciones.'}
          </p>
        </Faq>
        <Faq
          question={en ? 'What if GatoPago is unavailable?' : '¿Y si GatoPago no está disponible?'}
        >
          <p>
            {en
              ? 'Your account and your funds are on the blockchain, not in GatoPago. Your key keeps signing, and any ERC-4337 service can send your operations, paying their network fee.'
              : 'Tu cuenta y tus fondos están en la blockchain, no en GatoPago. Tu llave sigue firmando, y cualquier servicio ERC-4337 puede enviar tus operaciones, pagando su comisión de red.'}
          </p>
        </Faq>
      </div>
    </>
  );
}

function Faq({ question, children }: { question: string; children: ReactNode }) {
  return (
    <details className="group px-0.5">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2.5 text-[14px] text-text">
        {question}
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-text-faint transition-transform group-open:rotate-180"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="flex flex-col gap-2 pb-2.5 text-[13px] leading-relaxed text-text-muted">
        {children}
      </div>
    </details>
  );
}
