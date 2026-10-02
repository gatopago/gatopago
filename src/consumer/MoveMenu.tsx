'use client';

import { MeliSprite } from '../marketing/MeliSprite';
import { ActionCard } from './Primitives';

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
      <ActionCard href="/receive" english={en} title={en ? 'Receive money' : 'Recibir dinero'} description={en ? 'View your verified receiving options.' : 'Consulta tus opciones verificadas para recibir.'} />
      <ActionCard href="/send" english={en} title={en ? 'Send or withdraw' : 'Enviar o retirar'} description={en ? 'Review before authorizing with your key.' : 'Revisa antes de autorizar con tu llave.'} />
    </div>
  </>;
}
