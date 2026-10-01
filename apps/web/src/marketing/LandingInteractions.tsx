'use client';

import { useEffect } from 'react';

/** Progressive enhancement of server-rendered marketing only. No wallet/auth SDK. */
export function LandingInteractions({ locale }: { locale: 'es' | 'en' }) {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.meli-landing');
    if (!root) return;
    const controller = new AbortController();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const menu = root.querySelector<HTMLElement>('[data-mobile-menu]');
    const menuButton = root.querySelector<HTMLButtonElement>('[data-menu-button]');
    const nav = root.querySelector<HTMLElement>('[data-nav-shell]');
    const dialog = root.querySelector<HTMLDialogElement>('[data-transaction-dialog]');
    let dialogTrigger: HTMLElement | null = null;
    function toggleMenu(open: boolean) {
      if (!menu || !menuButton) return;
      menu.hidden = !open;
      menuButton.setAttribute('aria-expanded', String(open));
      menuButton.setAttribute('aria-label', (open ? menuButton.dataset.closeLabel : menuButton.dataset.openLabel) ?? 'Menu');
      nav?.classList.toggle('is-menu-open', open);
    }
    async function onClick(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      const target = event.target.closest<HTMLElement>('button, a');
      if (!target || !root?.contains(target)) return;
      if (target.matches('[data-menu-button]')) toggleMenu(menu?.hidden !== false);
      if (menu?.contains(target) && target.tagName === 'A') toggleMenu(false);
      if (target.matches('[data-nap-toggle]')) {
        const sleeping = target.getAttribute('aria-pressed') !== 'true';
        target.setAttribute('aria-pressed', String(sleeping));
        root.querySelector('[data-cat-stage]')?.classList.toggle('is-sleeping', sleeping);
        const status = root.querySelector('[data-nap-status]');
        if (status) status.textContent = (sleeping ? target.dataset.asleep : target.dataset.awake) ?? '';
      }
      if (target.matches('[data-cycle-state]')) {
        const lab = target.closest<HTMLElement>('[data-cycle-lab]');
        const states = [...(lab?.querySelectorAll<HTMLElement>('[data-cycle-state]') ?? [])];
        states.forEach((state) => {
          state.classList.toggle('is-active', state === target);
          state.setAttribute('aria-pressed', String(state === target));
        });
        lab?.style.setProperty('--cycle-index', String(states.indexOf(target)));
        const detail = lab?.querySelector('[data-cycle-detail]');
        const status = lab?.querySelector('[data-cycle-status]');
        const expression = lab?.querySelector<HTMLElement>('[data-cycle-expression]');
        if (detail) detail.textContent = target.dataset.detail ?? '';
        if (status) status.textContent = target.dataset.status ?? '';
        if (expression) expression.dataset.expression = target.dataset.expression ?? 'focused';
      }
      if (target.matches('[data-dialog-open]') && dialog && !dialog.open) {
        dialogTrigger = target;
        dialog.showModal();
      }
      if (target.matches('[data-copy-payment]')) {
        // This is a clearly labelled demo, never an economic intent or a QR to fund.
        const label = target.querySelector<HTMLElement>('[data-copy-label]');
        try {
          await navigator.clipboard.writeText(target.dataset.paymentLink ?? '');
          if (controller.signal.aborted) return;
          if (label) label.textContent = target.dataset.copiedLabel ?? 'Copied';
          target.classList.add('is-copied');
        } catch {
          if (controller.signal.aborted) return;
          if (label) label.textContent = locale === 'es' ? 'No se pudo copiar. Reintenta.' : 'Could not copy. Try again.';
        }
        const timer = setTimeout(() => {
          if (label) label.textContent = target.dataset.defaultLabel ?? 'Copy';
          target.classList.remove('is-copied');
          timers.delete(timer);
        }, 2000);
        timers.add(timer);
      }
    }
    root.addEventListener('click', onClick, { signal: controller.signal });
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && menu && !menu.hidden) { toggleMenu(false); menuButton?.focus(); }
    }, { signal: controller.signal });
    dialog?.addEventListener('close', () => dialogTrigger?.focus(), { signal: controller.signal });
    // Only clicks outside the dialog rectangle dismiss it; padding is not a backdrop.
    dialog?.addEventListener('click', (event) => {
      const box = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) dialog.close();
    }, { signal: controller.signal });
    // No global .js class that would hide SSR content when hydration is delayed/fails.
    return () => {
      controller.abort();
      timers.forEach(clearTimeout);
      if (dialog?.open) dialog.close();
      toggleMenu(false);
    };
  }, [locale]);
  return null;
}
