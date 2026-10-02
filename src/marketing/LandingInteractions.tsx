'use client';

import { useEffect } from 'react';
import { navigationScrollState } from './navigation-scroll';

/** Progressive enhancement of server-rendered marketing only. No wallet/auth SDK. */
export function LandingInteractions({ locale }: { locale: 'es' | 'en' }) {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.meli-landing');
    if (!root) return;
    const controller = new AbortController();
    const menu = root.querySelector<HTMLElement>('[data-mobile-menu]');
    const menuButton = root.querySelector<HTMLButtonElement>('[data-menu-button]');
    const nav = root.querySelector<HTMLElement>('[data-nav-shell]');
    let previousY = Math.max(0, window.scrollY);
    let scrollFrame: number | null = null;
    function updateNavigation() {
      scrollFrame = null;
      if (!nav) return;
      const state = navigationScrollState(previousY, window.scrollY, menu?.hidden === false || !!nav.querySelector(':focus-visible'));
      nav.classList.toggle('is-scrolled', state.scrolled);
      if (state.hidden !== null) nav.classList.toggle('is-hidden', state.hidden);
      previousY = state.previousY;
    }
    function onScroll() {
      if (scrollFrame === null) scrollFrame = requestAnimationFrame(updateNavigation);
    }
    function toggleMenu(open: boolean) {
      if (!menu || !menuButton) return;
      menu.hidden = !open;
      menuButton.setAttribute('aria-expanded', String(open));
      menuButton.setAttribute('aria-label', (open ? menuButton.dataset.closeLabel : menuButton.dataset.openLabel) ?? 'Menu');
      nav?.classList.toggle('is-menu-open', open);
      if (open) nav?.classList.remove('is-hidden');
      previousY = Math.max(0, window.scrollY);
    }
    function onClick(event: MouseEvent) {
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
    }
    root.addEventListener('click', onClick, { signal: controller.signal });
    updateNavigation();
    window.addEventListener('scroll', onScroll, { passive: true, signal: controller.signal });
    nav?.addEventListener('focusin', () => nav.classList.remove('is-hidden'), { signal: controller.signal });
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && menu && !menu.hidden) { toggleMenu(false); menuButton?.focus(); }
    }, { signal: controller.signal });
    // No global .js class that would hide SSR content when hydration is delayed/fails.
    return () => {
      controller.abort();
      if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
      toggleMenu(false);
      nav?.classList.remove('is-hidden', 'is-scrolled');
    };
  }, [locale]);
  return null;
}
