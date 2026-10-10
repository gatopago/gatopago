import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Landing } from '../src/marketing/Landing';
import { consumerRoutes } from '../src/consumer/routes';
import english from '../src/messages/en.json';
import spanish from '../src/messages/es.json';
import { withTexts } from './translations';

/** The landing in `lang`, with its texts as the page reads them from the catalog. */
const landing = (lang: 'es' | 'en') =>
  renderToStaticMarkup(
    withTexts(
      createElement(Landing, { lang, copy: (lang === 'en' ? english : spanish).Landing }),
      lang,
    ),
  );

vi.mock('../src/marketing/MeliSprite', () => ({
  MeliSprite: ({ variant }: { variant: string }) =>
    createElement('span', { 'data-meli-variant': variant, 'aria-hidden': true }),
}));

describe('Complete product landing', () => {
  it.each(['es', 'en'] as const)(
    'keeps %s product sections, brand and accurate access facts',
    (lang) => {
      const html = landing(lang);
      expect(html).toContain('src="/Logo_gatopago.svg"');
      expect(html).toContain('data-meli-variant="head-neutral"');
      expect(html).toContain('data-meli-variant="body-sitting"');
      expect(html).toContain(lang === 'es' ? 'Con fondos de prueba' : 'With test funds');
      expect(html).toContain(
        lang === 'es' ? 'GatoPago no puede mover tus fondos' : 'GatoPago cannot move your funds',
      );
      expect(html).toContain(lang === 'es' ? 'las cubre GatoPago' : 'GatoPago covers the fee');
      for (const id of ['problem', 'cycle', 'account', 'receive', 'grow', 'control', 'card', 'api'])
        expect(html).toContain(`id="${id}"`);
      // Product copy without technical jargon: no networks, protocols or wallet terms.
      expect(html).not.toMatch(
        /Arbitrum|Avalanche|Monad|Sepolia|Fuji|Aave|passkey|seed phrase|frases? semilla|\bgas\b|blockchain/i,
      );
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
      const html = landing(lang);
      const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
      const anchors = [...html.matchAll(/<a\b[^>]*>/g)].map(([tag]) => tag);
      // The language switch goes to the other language's landing; every other link stays in this one.
      const switches = anchors.filter((tag) => tag.includes('data-locale-link'));
      expect(switches.length).toBeGreaterThan(0);
      // Back to Spanish goes through /es: next-intl keeps the choice, then drops the prefix.
      for (const tag of switches) expect(tag).toContain(`href="/${lang === 'en' ? 'es' : 'en'}"`);
      const links = anchors
        .filter((tag) => !tag.includes('data-locale-link'))
        .flatMap((tag) => [...tag.matchAll(/\bhref="([^"]+)"/g)].map((match) => match[1]));
      // GatoPago Business, the merchant console, is its own site.
      expect(links).toContain('https://business.gatopago.com');
      // The footer credits its author on Instagram.
      expect(links).toContain('https://instagram.com/danelerr');
      for (const href of links) {
        if (href === 'https://business.gatopago.com' || href === 'https://instagram.com/danelerr')
          continue;
        if (href.startsWith('#')) expect(ids.has(href.slice(1)), href).toBe(true);
        else {
          const url = new URL(href, 'https://gatopago.com');
          expect(url.origin).toBe('https://gatopago.com');
          expect(url.search).toBe('');
          // English addresses are under /en.
          const full = url.pathname.replace(/\/$/, '') || '/';
          const english = full === '/en' || full.startsWith('/en/');
          expect(english, href).toBe(lang === 'en');
          const path = english ? full.slice(3) || '/' : full;
          if (!(path in consumerRoutes))
            expect([
              '/',
              '/terms',
              '/privacy',
              '/docs',
              '/login',
              '/pay/demo-cafe-norte',
            ]).toContain(path);
        }
      }
      const prefix = lang === 'en' ? '/en' : '';
      for (const href of ['/app', '/login', '/docs', '/pay/demo-cafe-norte'])
        expect(links).toContain(`${prefix}${href}`);
    },
  );
  it('links to an example payment request', () => {
    const html = landing('es');
    expect(html).toContain('Ver el cobro de ejemplo');
    expect(html).toContain('href="/pay/demo-cafe-norte"');
    expect(spanish.Demo.description).toContain('Así ven tus clientes tus links de cobro');
  });
});
