import type { ReactNode } from 'react';
import { MeliSprite } from '../marketing/MeliSprite';
import { PixelRail } from './PixelRail';

export function TxResult({
  state,
  lead,
  amount,
  unit,
  body,
  children,
}: {
  state: 'success' | 'pending' | 'failed' | 'progress';
  lead: string;
  amount?: string;
  unit?: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center py-8 text-center"
      role="status"
      aria-live="polite"
    >
      <MeliSprite
        variant={
          state === 'success' ? 'head-happy' : state === 'failed' ? 'head-cautious' : 'head-focused'
        }
        className={`mb-5 w-24${state === 'success' ? ' meli-motion-purr' : ''}`}
      />
      {state === 'pending' || state === 'progress' ? (
        <PixelRail state="active" className="mb-4 max-w-[180px]" />
      ) : null}
      {state === 'success' ? (
        <span
          className="mb-4 grid h-10 w-10 place-items-center border-2 border-growth bg-growth/12 text-growth shadow-[3px_3px_0_rgb(40_123_85/.24)]"
          aria-hidden="true"
        >
          ✓
        </span>
      ) : null}
      <p className="mb-1 text-pretty text-[15px] text-text-muted">{lead}</p>
      {amount !== undefined ? (
        <p className="type-mono mb-4 max-w-full break-words text-[40px] font-bold leading-none">
          {amount}
          {unit ? <span className="ml-1.5 text-[20px] text-text-muted">{unit}</span> : null}
        </p>
      ) : null}
      {body ? (
        <p className="mb-2 max-w-[320px] text-pretty text-[13px] leading-relaxed text-text-faint">
          {body}
        </p>
      ) : null}
      {children}
    </div>
  );
}
