'use client';

import type { ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { MeliSprite } from '../marketing/MeliSprite';
import { NavigationLink } from './NavigationLink';
import { PixelRail } from './PixelRail';
import { OptionCard, SectionLabel } from './Primitives';
import { localizedPath } from './routes';

const icon = (children: ReactNode) => (
  <svg
    aria-hidden="true"
    width="19"
    height="19"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);
const receiveIcon = icon(
  <>
    <path d="M12 5v14" />
    <path d="m19 12-7 7-7-7" />
  </>,
);

/** `/move`, as in V2: receive, send or swap; receiving then chooses a request or the account. */
export function MoveMenu({ english: en }: { english: boolean }) {
  const receiving = useSearchParams().get('flow') === 'receive';

  if (receiving)
    return (
      <>
        <header className="mb-4">
          <NavigationLink
            href={localizedPath('/move', en)}
            className="meli-square-action mb-6 px-3 text-[12px]"
          >
            <span aria-hidden="true">←</span>
            {en ? 'Back to Move' : 'Volver a Mover'}
          </NavigationLink>
          <div className="flex items-end gap-3">
            <div className="min-w-0 flex-1">
              <p className="meli-kicker mb-3">
                {en ? 'Your money, in motion' : 'Tu dinero, en movimiento'}
              </p>
              <h1 className="font-display text-[34px] leading-[.96]">
                {en ? 'Receive money' : 'Recibir dinero'}
              </h1>
              <p className="mt-3 text-[13px] leading-relaxed text-text-muted">
                {en
                  ? 'Choose whether to request a payment or share your account details.'
                  : 'Elige si quieres solicitar un pago o compartir los datos de tu cuenta.'}
              </p>
            </div>
            <MeliSprite variant="body-qr" className="w-24 shrink-0" motion="idle" />
          </div>
        </header>
        <PixelRail state="future" className="mb-5" />
        <div className="flex flex-col gap-2.5">
          <OptionCard
            href="/charge"
            english={en}
            tone="brand"
            title={en ? 'Request with a link or QR' : 'Cobrar con link o QR'}
            description={
              en
                ? 'Set an amount and concept to request a payment'
                : 'Define un monto y concepto para solicitar un pago'
            }
            icon={icon(
              <>
                <path d="M12 8v8" />
                <path d="M8 12h8" />
                <rect x="3" y="4" width="18" height="16" rx="3" />
              </>,
            )}
          />
          <OptionCard
            href="/receive"
            english={en}
            tone="info"
            title={en ? 'Receive into my account' : 'Recibir en mi cuenta'}
            description={
              en
                ? 'From a wallet or exchange using the correct network and address'
                : 'Desde una wallet o exchange usando la red y dirección correctas'
            }
            icon={receiveIcon}
          />
        </div>
      </>
    );

  return (
    <>
      <header className="mb-4 flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <p className="meli-kicker mb-3">
            {en ? 'Your money, in motion' : 'Tu dinero, en movimiento'}
          </p>
          <h1 className="font-display text-[36px] leading-[.94]">{en ? 'Move' : 'Mover'}</h1>
          <p className="mt-3 text-[13px] leading-relaxed text-text-muted">
            {en
              ? 'Choose what you want to do. GatoPago handles the route and shows the details before confirmation.'
              : 'Elige qué quieres hacer. GatoPago se ocupa de la ruta y te muestra los detalles antes de confirmar.'}
          </p>
        </div>
        <MeliSprite variant="body-courier" className="w-24 shrink-0" motion="deliver" />
      </header>
      <PixelRail state="idle" className="mb-5" />
      <SectionLabel>{en ? 'What do you want to do?' : '¿Qué quieres hacer?'}</SectionLabel>
      <div className="flex flex-col gap-2.5">
        <OptionCard
          href="/move?flow=receive"
          english={en}
          tone="info"
          title={en ? 'Receive money' : 'Recibir dinero'}
          description={
            en
              ? 'Request with a link or receive into one of your accounts'
              : 'Cobrar con un link o recibir en una de tus cuentas'
          }
          icon={receiveIcon}
        />
        <OptionCard
          href="/send"
          english={en}
          tone="brand"
          title={en ? 'Send money' : 'Enviar dinero'}
          description={
            en
              ? 'To a GatoPago account, wallet, exchange, or another network'
              : 'A una cuenta GatoPago, wallet, exchange u otra red'
          }
          icon={icon(
            <>
              <path d="M12 19V5" />
              <path d="m5 12 7-7 7 7" />
            </>,
          )}
        />
        <OptionCard
          href="/swap"
          english={en}
          tone="neutral"
          title={en ? 'Swap' : 'Cambiar'}
          description={
            en
              ? 'Convert assets with a breakdown before signing'
              : 'Convierte activos con desglose antes de firmar'
          }
          icon={icon(
            <>
              <path d="M7 4v16" />
              <path d="m3 8 4-4 4 4" />
              <path d="M17 20V4" />
              <path d="m13 16 4 4 4-4" />
            </>,
          )}
        />
      </div>
    </>
  );
}
