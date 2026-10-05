'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/** Native dialog keeps focus inside and opens above the app's animated frame. */
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
  return (
    <dialog
      ref={dialog}
      className="meli-menu-sheet"
      data-variant={variant}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (!busy && event.target === event.currentTarget) onClose();
      }}
    >
      <div className="meli-menu-sheet__body">{children}</div>
    </dialog>
  );
}
