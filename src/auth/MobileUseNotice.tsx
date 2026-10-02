'use client';

import { useEffect, useId, useRef } from 'react';
import { CatGlyph } from '../marketing/CatGlyph';

const ACKNOWLEDGED = 'gatopago-mobile-use-ack';

/** Presentation hint only: never blocks access or changes authentication. */
export function MobileUseNotice({ english: en }: { english: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const accepted = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px) and (hover: hover) and (pointer: fine)');
    try { accepted.current = sessionStorage.getItem(ACKNOWLEDGED) === '1'; } catch { /* Optional preference. */ }
    const show = () => {
      if (!desktop.matches) { dialog.current?.close(); return; }
      if (!accepted.current && dialog.current && !dialog.current.open) dialog.current.showModal();
    };
    show();
    desktop.addEventListener('change', show);
    const element = dialog.current;
    return () => { desktop.removeEventListener('change', show); element?.close(); };
  }, []);
  function acknowledge() {
    accepted.current = true;
    try { sessionStorage.setItem(ACKNOWLEDGED, '1'); } catch { /* Browsing still works without storage. */ }
  }
  return <dialog ref={dialog} className="mobile-use-notice" aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={acknowledge}>
    <CatGlyph className="mobile-use-notice__symbol" decorative />
    <h2 id={titleId}>{en ? 'Better on your phone' : 'Mejor en tu teléfono'}</h2>
    <p id={descriptionId}>{en
      ? 'GatoPago is designed for your phone. You can keep trying it on your computer, but the best experience is on mobile.'
      : 'GatoPago está pensada para usarse en el celular. Puedes seguir probándola aquí en tu computadora, pero la mejor experiencia es en el móvil.'}</p>
    <form method="dialog" onSubmit={acknowledge}><button type="submit" className="btn btn-primary btn-block">{en ? 'Continue on computer' : 'Continuar en computadora'}</button></form>
  </dialog>;
}
