'use client';

import { useEffect, useRef, useState } from 'react';

/** The clipboard is missing outside a secure context and the browser can refuse it. */
export const copyText = (value: string) =>
  navigator.clipboard?.writeText(value) ?? Promise.reject(new Error('CLIPBOARD_UNAVAILABLE'));

/**
 * A copy button's words, the same everywhere: its own label, "Copied ✓" for two seconds, or
 * "Could not copy" until the next try. `what` tells apart several buttons on one screen.
 */
export function useCopy(en: boolean) {
  const [last, setLast] = useState<{ what: string; copied: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function copy(value: string, what = '') {
    clearTimeout(timer.current);
    copyText(value).then(
      () => {
        setLast({ what, copied: true });
        timer.current = setTimeout(() => setLast(null), 2000);
      },
      () => setLast({ what, copied: false }),
    );
  }
  const failed = (what = '') => last?.what === what && !last.copied;
  const label = (idle: string, what = '') =>
    last?.what !== what
      ? idle
      : last.copied
        ? en
          ? 'Copied ✓'
          : 'Copiado ✓'
        : en
          ? 'Could not copy'
          : 'No se pudo copiar';
  return { copy, label, failed };
}
