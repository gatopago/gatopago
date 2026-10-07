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
      expect(html).toContain(lang === 'es' ? 'Con fondos de prueba' : 'With test funds');
      expect(html).toContain(
        lang === 'es' ? 'GatoPago no puede mover tus fondos' : 'GatoPago cannot move your funds',
      );
      expect(html).toContain(lang === 'es' ? 'GatoPago paga el gas' : 'GatoPago pays the gas');
      for (const id of ['cycle', 'account', 'receive', 'grow', 'control', 'card', 'api'])
        expect(html).toContain(`id="${id}"`);
      expect(html).toContain('Aave V3');
      expect(html).toContain('/v1/payment_intents');
      expect(html).toContain(lang === 'es' ? 'Próximamente' : 'Coming soon');
      // Commercial copy: no self-deprecating disclaimers or stale claims.
      expect(html).not.toMatch(
        /ETH de prueba|test ETH|patrocinio configurado|Sponsorship is not|no cobrable|not payable|no prometemos|not promising|Preguntas honestas|Honest questions|pierdes el acceso|access to your funds is lost|V3 preview|Vista previa V3/,
      );
    },
  );
  it.each(['es', 'en'] as const)(
    'has no broken anchors or unavailable action links in %s',
    (lang) => {
      const html = renderToStaticMarkup(createElement(Landing, { lang }));
      const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
      const links = [...html.matchAll(/\bhref="([^"]+)"/g)].map((match) => match[1]);
      // GatoPago Business, the merchant console, is its own site.
      expect(links).toContain('https://business.gatopago.com');
      for (const href of links) {
        if (href === 'https://business.gatopago.com') continue;
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
              '/en/docs',
              '/login',
              '/pay/demo-cafe-norte',
              '/en/pay/demo-cafe-norte',
            ]).toContain(path);
            // Static pages have a path per language; the app reads `?lang`.
            expect(url.searchParams.get('lang')).toBe(
              path === '/login' && lang === 'en' ? 'en' : null,
            );
          }
        }
      }
      for (const href of ['/app', '/login']) {
        expect(links).toContain(`${href}${lang === 'en' ? '?lang=en' : ''}`);
      }
      expect(links).toContain(lang === 'en' ? '/en/docs' : '/docs');
      expect(links).toContain(lang === 'en' ? '/en/pay/demo-cafe-norte' : '/pay/demo-cafe-norte');
    },
  );
  it('links to an example payment request', () => {
    const html = renderToStaticMarkup(createElement(Landing, { lang: 'es' }));
    expect(html).toContain('Ver el cobro de ejemplo');
    expect(html).toContain('href="/pay/demo-cafe-norte"');
    expect(readFileSync('src/marketing/DemoPayment.tsx', 'utf8').replace(/\s+/g, ' ')).toContain(
      'Así ven tus clientes tus links de cobro',
    );
  });
});
