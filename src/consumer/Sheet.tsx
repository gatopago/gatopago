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
 * Native dialog keeps focus inside and opens above the app's animated frame. It leaves with an
 * animation when the member closes it: the backdrop, Escape, or any `[data-sheet-close]` inside.
 */
export function Sheet({
  titleId,
  children,
  onClose,
  busy = false,
  variant = 'sheet',
}: {
  titleId: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  variant?: 'sheet' | 'menu' | 'selector' | 'receipt' | 'stage';
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
    if (variant === 'selector')
      element?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
    holdPage();
    return () => {
      element?.close();
      releasePage();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [variant]);
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
