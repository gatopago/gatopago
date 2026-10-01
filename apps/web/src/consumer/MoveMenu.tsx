'use client';

import { useSearchParams } from 'next/navigation';
import { MeliSprite } from '../marketing/MeliSprite';
import { ActionCard, BackHeader } from './Primitives';

/** Move's original card hierarchy, without importing the V2 account client. */
export function MoveMenu({ english: en }: { english: boolean }) {
  const receiving = useSearchParams().get('flow') === 'receive';
  if (receiving) return <><BackHeader title={en ? 'Receive money' : 'Recibir dinero'} english={en} to="/move" />
    <ActionCard href="/charge" english={en} title={en ? 'Request with a link' : 'Cobrar con enlace'} description={en ? 'Set the amount and reference.' : 'Define el monto y la referencia.'} />
    <ActionCard href="/receive" english={en} title={en ? 'Wallet or exchange' : 'Wallet o exchange'} description={en ? 'Check your receiving address and network.' : 'Consulta tu dirección y red de recepción.'} />
  </>;
  return <>
    <header className="mb-4 flex items-end gap-3">
      <div className="min-w-0 flex-1">
        <p className="meli-kicker mb-3">{en ? 'Your money' : 'Tu dinero'}</p>
        <h1 className="font-display text-[36px] leading-[.94]">{en ? 'Move your money' : 'Mueve tu dinero'}</h1>
        <p className="mt-3 text-[13px] leading-relaxed text-text-muted">{en ? 'Choose what you want to do.' : 'Elige qué quieres hacer.'}</p>
      </div>
      <MeliSprite variant="body-courier" className="w-24 shrink-0" />
    </header>
    <div className="mt-5 flex flex-col gap-2.5">
      <ActionCard href="/move?flow=receive" english={en} title={en ? 'Receive money' : 'Recibir dinero'} description={en ? 'Payment link, wallet or exchange.' : 'Enlace de cobro, wallet o exchange.'} />
      <ActionCard href="/send" english={en} title={en ? 'Send or withdraw' : 'Enviar o retirar'} description={en ? 'Review before authorizing with your key.' : 'Revisa antes de autorizar con tu llave.'} />
      <ActionCard href="/swap" english={en} title={en ? 'Swap' : 'Cambiar'} description={en ? 'Choose the assets and review a quote.' : 'Elige los activos y revisa una cotización.'} />
      <ActionCard href="/crosschain" english={en} title={en ? 'Another network' : 'Otra red'} description={en ? 'Review cross-chain availability.' : 'Revisa la disponibilidad entre redes.'} />
    </div>
  </>;
}
