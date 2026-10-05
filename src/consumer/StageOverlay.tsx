'use client';

import { useId } from 'react';
import { MeliSprite } from '../marketing/MeliSprite';
import { PixelRail } from './PixelRail';
import { Sheet } from './Sheet';

/** The original full-screen money-in-motion presentation, driven by real work only. */
export function StageOverlay({
  label,
  spinner = true,
}: {
  label: string | null;
  spinner?: boolean;
}) {
  const titleId = useId();
  if (!label) return null;
  return (
    <Sheet variant="stage" titleId={titleId} onClose={() => {}} busy>
      <MeliSprite
        variant={spinner ? 'body-courier' : 'head-focused'}
        className={spinner ? 'meli-motion-deliver w-36' : 'meli-motion-idle w-24'}
        loading="eager"
      />
      <div
        role="status"
        aria-live="polite"
        className="flex w-full max-w-[260px] flex-col items-center gap-3"
      >
        {spinner ? <PixelRail state="active" /> : null}
        <p id={titleId} className="text-center font-display text-[16px] text-text">
          {label}
        </p>
      </div>
    </Sheet>
  );
}
