'use client';

import { useState } from 'react';

/**
 * Text that changes in place (a balance, "Copy" turning into "Copied"): the new text rises 4px and
 * fades in where the old one was, instead of jumping. The first text a screen shows stays still.
 */
export function SwapText({ children }: { children: string }) {
  const [shown, setShown] = useState(children);
  const [changed, setChanged] = useState(false);
  if (children !== shown) {
    setShown(children);
    setChanged(true);
  }
  return (
    <span key={children} className={changed ? 'text-swap' : undefined}>
      {children}
    </span>
  );
}
