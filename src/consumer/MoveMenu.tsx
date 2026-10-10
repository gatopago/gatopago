'use client';

import type { ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { MeliSprite } from '../marketing/MeliSprite';
import { BackHeader, OptionCard, TabHeader } from './Primitives';

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
        <BackHeader title={en ? 'Receive money' : 'Recibir dinero'} english={en} to="/move" />
        <div className="mb-5 flex items-end gap-3">
          <p className="min-w-0 flex-1 text-[14px] leading-relaxed text-text-muted">
            {en
              ? 'Ask someone to pay you, or share your details to receive from a wallet or exchange.'
              : 'Pide un pago a alguien o comparte tus datos para recibir desde una wallet o un exchange.'}
          </p>
          <MeliSprite variant="body-qr" className="w-20 shrink-0" motion="idle" />
        </div>
        <div className="flex flex-col gap-2.5">
          <OptionCard
            href="/charge"
            english={en}
            tone="brand"
            title={en ? 'Request a payment' : 'Cobrar'}
            description={
              en
                ? 'Create a link or QR with an amount and a note'
                : 'Crea un link o un QR con monto y concepto'
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
            title={en ? 'Receive in my account' : 'Recibir en mi cuenta'}
            description={
              en
                ? 'Your address and QR, for a wallet or an exchange'
                : 'Tu dirección y tu QR, para una wallet o un exchange'
            }
            icon={receiveIcon}
          />
        </div>
      </>
    );

  return (
    <>
      <TabHeader
        title={en ? 'Move' : 'Mover'}
        description={
          en
            ? 'Choose what to do. You will see every detail before confirming.'
            : 'Elige qué hacer. Verás todos los detalles antes de confirmar.'
        }
        art={<MeliSprite variant="body-courier" motion="deliver" />}
      />
      <div className="flex flex-col gap-2.5">
        <OptionCard
          href="/move?flow=receive"
          english={en}
          tone="info"
          title={en ? 'Receive' : 'Recibir'}
          description={
            en
              ? 'Request a payment or share your account'
              : 'Cobra con un link o comparte tu cuenta'
          }
          icon={receiveIcon}
        />
        <OptionCard
          href="/send"
          english={en}
          tone="brand"
          title={en ? 'Send' : 'Enviar'}
          description={
            en
              ? 'To a @username, a wallet or an exchange'
              : 'A un @usuario, una wallet o un exchange'
          }
          icon={icon(
            <>
              <path d="M12 19V5" />
              <path d="m5 12 7-7 7 7" />
            </>,
          )}
        />
        <OptionCard
          href="/team"
          english={en}
          tone="brand"
          title={en ? 'Group payment' : 'Pago en grupo'}
          description={
            en
              ? 'Several people at once, from your balance or your savings'
              : 'A varias personas a la vez, desde tu saldo o tu ahorro'
          }
          icon={icon(
            <>
              <circle cx="9" cy="8" r="3" />
              <path d="M3 19c0-3 3-5 6-5s6 2 6 5" />
              <path d="M16 11a3 3 0 1 0 0-6" />
              <path d="M21 19c0-2-1.5-3.6-4-4.4" />
            </>,
          )}
        />
        <OptionCard
          href="/swap"
          english={en}
          tone="neutral"
          title={en ? 'Swap' : 'Cambiar'}
          description={en ? 'Between USDC and other coins' : 'Entre USDC y otras monedas'}
          icon={icon(
            <>
              <path d="M7 4v16" />
              <path d="m3 8 4-4 4 4" />
              <path d="M17 20V4" />
              <path d="m13 16 4 4 4-4" />
            </>,
          )}
        />
        <OptionCard
          href="/crosschain"
          english={en}
          tone="pending"
          title={en ? 'Between networks' : 'Entre redes'}
          description={
            en ? 'Move your USDC from one network to another' : 'Pasa tus USDC de una red a otra'
          }
          icon={icon(
            <>
              <path d="M7 7h11l-3-3" />
              <path d="m18 7-3 3" />
              <path d="M17 17H6l3 3" />
              <path d="m6 17 3-3" />
            </>,
          )}
        />
      </div>
    </>
  );
}
