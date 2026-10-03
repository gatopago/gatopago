'use client';

import { MeliSprite } from '../marketing/MeliSprite';
import { ActionCard } from './Primitives';
import { ReceiveIcon, SendIcon, GrowIcon } from './Icons';

/** Daily actions that have a connected account flow. */
export function MoveMenu({ english: en }: { english: boolean }) {
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
      <ActionCard href="/receive" english={en} icon={<ReceiveIcon />} title={en ? 'Receive money' : 'Recibir dinero'} description={en ? 'Your address and QR, ready to share.' : 'Tu dirección y QR para compartir.'} />
      <ActionCard href="/send" english={en} icon={<SendIcon />} title={en ? 'Send or withdraw' : 'Enviar o retirar'} description={en ? 'Review the amount and destination before confirming.' : 'Revisa el monto y destino antes de confirmar.'} />
      <ActionCard href="/grow" english={en} icon={<GrowIcon />} title={en ? 'Grow' : 'Crecer'} description={en ? 'Manage your USDC position in Aave.' : 'Gestiona tu posición USDC en Aave.'} />
    </div>
  </>;
}
