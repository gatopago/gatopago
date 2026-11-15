import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CascabelPage } from '../src/marketing/CascabelPage';
import english from '../src/messages/en.json';
import spanish from '../src/messages/es.json';
import { withTexts } from './translations';

/** `/cascabel` in `lang`, with its texts as the page reads them from the catalog. */
const page = (lang: 'es' | 'en') =>
  renderToStaticMarkup(
    withTexts(
      createElement(CascabelPage, { lang, copy: (lang === 'en' ? english : spanish).Cascabel }),
      lang,
    ),
  );

vi.mock('../src/marketing/MeliSprite', () => ({
  MeliSprite: ({ variant }: { variant: string }) =>
    createElement('span', { 'data-meli-variant': variant, 'aria-hidden': true }),
}));

describe('Cascabel page', () => {
  it.each(['es', 'en'] as const)('says in %s only what Cascabel does today', (lang) => {
    const html = page(lang);
    for (const id of ['hero', 'example', 'ways', 'steps', 'gets', 'not-yet'])
      expect(html).toContain(`id="${id}"`);
    expect(html).toContain(lang === 'es' ? 'Cascabel, de GatoPago' : 'Cascabel by GatoPago');
    expect(html).toContain('href="https://business.gatopago.com"');
    expect(html).toContain(lang === 'es' ? 'href="/docs"' : 'href="/en/docs"');
    // The two ways in: the app's charge links and the API.
    expect(html).toContain(lang === 'es' ? 'href="/app"' : 'href="/en/app"');
    expect(html).toContain(lang === 'es' ? 'hasta 10 intentos' : 'up to 10 attempts');
    expect(html).toContain(lang === 'es' ? 'auditoría externa' : 'external audit');
    expect(html).toContain('Arbitrum, Avalanche');
    // The example answers what the API answers, with the studio's USD 500.
    expect(html).toContain('requires_payment');
    expect(html).toContain('500.00');
    expect(html).toContain('// ');
    // Not claimed until anyone can move their money without GatoPago (roadmap/SALIDA.md).
    expect(html).not.toMatch(/autocustodi|self-custod/i);
    // Not true: only the checkout's networks, never from an exchange, and AUSD is not deployed.
    expect(html).not.toMatch(/cualquier wallet|any wallet|AUSD/);
    expect(html).not.toContain('Flow');
  });
});
