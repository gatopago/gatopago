import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { Landing } from '../src/marketing/Landing';
import { consumerRoutes } from '../src/consumer/routes';

vi.mock('../src/marketing/MeliSprite', () => ({ MeliSprite: ({ variant }: { variant: string }) => createElement('span', { 'data-meli-variant': variant, 'aria-hidden': true }) }));

describe('Focused consumer landing', () => {
  it.each(['es', 'en'] as const)('keeps %s brand and safety copy, without dummy products or payment evidence', lang => {
    const html = renderToStaticMarkup(createElement(Landing, { lang }));
    expect(html).toContain('src="/Logo_gatopago.svg"');
    expect(html).toContain('data-meli-variant="head-neutral"');
    expect(html).toContain('data-meli-variant="body-sitting"');
    expect(html).toContain('Arbitrum Sepolia');
    expect(html).toContain(lang === 'es' ? 'Sólo fondos de prueba' : 'Test funds only');
    expect(html).toContain(lang === 'es' ? 'Una llave autorizada basta' : 'One authorized key is sufficient');
    expect(html).toContain(lang === 'es' ? 'no tiene patrocinio configurado' : 'Sponsorship is not configured');
    expect(html).not.toMatch(/disabled=|<dialog|data-copy-payment|demo-cafe|1,280|420\.00|18\.00|Aave|GatoPago Card|paymentIntents|LIVE PATH/);
  });
  it.each(['es', 'en'] as const)('has no broken anchors or unavailable action links in %s', lang => {
    const html = renderToStaticMarkup(createElement(Landing, { lang }));
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
    const links = [...html.matchAll(/\bhref="([^"]+)"/g)].map(match => match[1]);
    for (const href of links) {
      if (href.startsWith('#')) expect(ids.has(href.slice(1)), href).toBe(true);
      else {
        const url = new URL(href, 'https://gatopago.com');
        expect(url.origin).toBe('https://gatopago.com');
        const path = url.pathname.replace(/\/$/, '') || '/';
        if (path in consumerRoutes) expect(url.searchParams.get('lang')).toBe(lang === 'en' ? 'en' : null);
        else expect(['/', '/en', '/terms', '/privacy', '/en/terms', '/en/privacy']).toContain(path);
      }
    }
    for (const href of ['/app', '/onboarding', '/receive', '/send', '/scan', '/statement']) {
      expect(links).toContain(`${href}${lang === 'en' ? '?lang=en' : ''}`);
    }
  });
  it('removes orphaned demo interactions and their styles instead of hiding them', () => {
    const interactions = readFileSync('src/marketing/LandingInteractions.tsx', 'utf8');
    expect(interactions).not.toMatch(/clipboard|HTMLDialogElement|showModal|data-copy-payment|data-dialog-open/);
    const css = readFileSync('src/marketing/landing.css', 'utf8');
    expect(css).not.toMatch(/\.meli-(app-frame|app-concept|receipt|grow|dialog|card-scene|concept-card|code-window|developers)\b/);
  });
});
