'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** How long a sheet takes to leave; `--sheet-out` in consumer.css. */
const LEAVE_MS = 180;

/**
 * The page stays still while any sheet is open. Counted, not saved per sheet: a sheet opened over
 * another (the confirmation's "confirm on your device") and both closing at once in either order
 * must leave the page scrollable, never restore the "hidden" the inner one saw.
 */
let openSheets = 0;
function holdPage() {
  if (openSheets++ === 0) document.body.style.overflow = 'hidden';
}
function releasePage() {
  if (--openSheets === 0) document.body.style.overflow = '';
}

/**
 * The sheet grows out of what opened it: from its place and size to its own, in 350ms. The
 * content is squeezed on the way, so it only becomes fully visible as the sheet arrives.
 */
function growFrom(element: HTMLDialogElement, from: DOMRect) {
  // Instead of the sheet's own entrance (its exit still runs when it closes). Measured at rest:
  // without that entrance, or a growth already begun (React runs effects twice in development).
  element.dataset.grown = '';
  element.getAnimations().forEach((animation) => animation.cancel());
  const to = element.getBoundingClientRect();
  if (!to.width || !to.height) return;
  const start = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
  element.animate(
    [
      { transformOrigin: 'top left', transform: start, opacity: 0.4 },
      { transformOrigin: 'top left', transform: 'none', opacity: 1 },
    ],
    { duration: 350, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
  );
}

/**
 * Native dialog keeps focus inside and opens above the app's animated frame. It leaves with an
 * animation when the member closes it: the backdrop, Escape, or any `[data-sheet-close]` inside.
 */
export function Sheet({
  titleId,
  children,
  onClose,
  busy = false,
  variant = 'sheet',
  from,
}: {
  titleId: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  variant?: 'sheet' | 'menu' | 'selector' | 'receipt' | 'stage';
  /** Where it was opened from on the screen (a row): it grows out of it instead of rising. */
  from?: DOMRect;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [leaving, setLeaving] = useState(false);
  // A layout effect: it closes the dialog while it is still in the page. Removed while open, a
  // modal dialog can leave the rest of the page inert in WebKit.
  useLayoutEffect(() => {
    const element = dialog.current;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    if (element && from && !matchMedia('(prefers-reduced-motion: reduce)').matches)
      growFrom(element, from);
    if (variant === 'selector')
      element?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
    holdPage();
    return () => {
      element?.close();
      releasePage();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [variant, from]);
  function close() {
    if (busy || leaving) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return onClose();
    setLeaving(true);
    setTimeout(onClose, LEAVE_MS);
  }
  return (
    <dialog
      ref={dialog}
      className="meli-menu-sheet"
      data-variant={variant}
      data-leaving={leaving || undefined}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        // Only this sheet's own closers: an option chosen in a selector opened inside it (the
        // card survey) closes that selector, never the sheet around it.
        const closer = (event.target as HTMLElement).closest('[data-sheet-close]');
        if (
          event.target === event.currentTarget ||
          closer?.closest('dialog') === event.currentTarget
        )
          close();
      }}
    >
      <div className="meli-menu-sheet__body">
        {variant === 'receipt' || variant === 'stage' ? null : (
          <div className="sheet-handle" aria-hidden="true" />
        )}
        {children}
      </div>
    </dialog>
  );
}
