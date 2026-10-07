'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/** How long a sheet takes to leave; `--sheet-out` in consumer.css. */
const LEAVE_MS = 180;

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
  useEffect(() => {
    const element = dialog.current;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    if (variant === 'selector')
      element?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
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
        const target = event.target as HTMLElement;
        if (event.target === event.currentTarget || target.closest('[data-sheet-close]')) close();
      }}
    >
      <div className="meli-menu-sheet__body">{children}</div>
    </dialog>
  );
}
