import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { Landing } from '../src/marketing/Landing';
import { consumerRoutes } from '../src/consumer/routes';

vi.mock('../src/marketing/MeliSprite', () => ({
  MeliSprite: ({ variant }: { variant: string }) =>
    createElement('span', { 'data-meli-variant': variant, 'aria-hidden': true }),
}));

describe('Complete product landing', () => {
  it.each(['es', 'en'] as const)(
    'keeps %s product sections, brand and accurate access facts',
    (lang) => {
      const html = renderToStaticMarkup(createElement(Landing, { lang }));
      expect(html).toContain('src="/Logo_gatopago.svg"');
      expect(html).toContain('data-meli-variant="head-neutral"');
      expect(html).toContain('data-meli-variant="body-sitting"');
      expect(html).toContain('Arbitrum Sepolia');
      expect(html).toContain(lang === 'es' ? 'Sólo fondos de prueba' : 'Test funds only');
      expect(html).toContain(
        lang === 'es' ? 'Una llave autorizada basta' : 'One authorized key is sufficient',
      );
      expect(html).toContain(
        lang === 'es' ? 'no tiene patrocinio configurado' : 'Sponsorship is not configured',
      );
      for (const id of ['account', 'receive', 'grow', 'move', 'control', 'card', 'api'])
        expect(html).toContain(`id="${id}"`);
      expect(html).toContain('Aave V3');
      expect(html).toContain('/v1/payment_intents');
      expect(html).toContain(
        lang === 'es' ? 'Concepto visual · datos de ejemplo' : 'Visual concept · example data',
      );
      expect(html).toContain(lang === 'es' ? 'Concepto futuro' : 'Future concept');
      expect(html).not.toMatch(/LIVE PATH|quorum|72 horas|72 hours|Google or email to sign in/);
    },
  );
  it.each(['es', 'en'] as const)(
    'has no broken anchors or unavailable action links in %s',
    (lang) => {
      const html = renderToStaticMarkup(createElement(Landing, { lang }));
      const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
      const links = [...html.matchAll(/\bhref="([^"]+)"/g)].map((match) => match[1]);
      for (const href of links) {
        if (href.startsWith('#')) expect(ids.has(href.slice(1)), href).toBe(true);
        else {
          const url = new URL(href, 'https://gatopago.com');
          expect(url.origin).toBe('https://gatopago.com');
          const path = url.pathname.replace(/\/$/, '') || '/';
          if (path in consumerRoutes)
            expect(url.searchParams.get('lang')).toBe(lang === 'en' ? 'en' : null);
          else {
            expect([
              '/',
              '/en',
              '/terms',
              '/privacy',
              '/en/terms',
              '/en/privacy',
              '/docs',
            ]).toContain(path);
            if (path === '/docs')
              expect(url.searchParams.get('lang')).toBe(lang === 'en' ? 'en' : null);
          }
        }
      }
      for (const href of ['/app', '/onboarding', '/docs']) {
        expect(links).toContain(`${href}${lang === 'en' ? '?lang=en' : ''}`);
      }
    },
  );
  it('identifies illustrations as examples and provides a dedicated sample receipt', () => {
    const html = renderToStaticMarkup(createElement(Landing, { lang: 'es' }));
    expect(html).toContain('El enlace no cobra ni permite enviar fondos');
    expect(html).toContain('Nada se enviará desde esta demostración');
    expect(html).toContain('data-payment-link="/pay/demo-cafe-norte"');
    expect(
      readFileSync('src/app/(es)/pay/demo-cafe-norte/page.tsx', 'utf8').replace(/\s+/g, ' '),
    ).toContain('no corresponden a una solicitud de pago');
  });
});
