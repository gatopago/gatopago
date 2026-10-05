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
      for (const id of ['account', 'receive', 'grow', 'move', 'control', 'card', 'api'])
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
              '/login',
            ]).toContain(path);
            if (path === '/docs' || path === '/login')
              expect(url.searchParams.get('lang')).toBe(lang === 'en' ? 'en' : null);
          }
        }
      }
      for (const href of ['/app', '/login', '/docs']) {
        expect(links).toContain(`${href}${lang === 'en' ? '?lang=en' : ''}`);
      }
    },
  );
  it('links to an example payment request', () => {
    const html = renderToStaticMarkup(createElement(Landing, { lang: 'es' }));
    expect(html).toContain('Así se verán tus links de cobro');
    expect(html).toContain('data-payment-link="/pay/demo-cafe-norte"');
    expect(
      readFileSync('src/app/(es)/pay/demo-cafe-norte/page.tsx', 'utf8').replace(/\s+/g, ' '),
    ).toContain('Así ven tus clientes tus cobros');
  });
});
