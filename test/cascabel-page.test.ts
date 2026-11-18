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
  it.each(['es', 'en'] as const)('speaks in %s to payment companies, honestly', (lang) => {
    const html = page(lang);
    for (const id of ['hero', 'how', 'today', 'why', 'avalanche'])
      expect(html).toContain(`id="${id}"`);
    expect(html).toContain(lang === 'es' ? 'Cascabel, de GatoPago' : 'Cascabel by GatoPago');
    expect(html).toContain('href="https://x.com/gatopago"');
    expect(html).toContain(lang === 'es' ? 'href="/docs"' : 'href="/en/docs"');
    // What works today and what is being built are told apart.
    expect(html).toContain(lang === 'es' ? 'En construcción' : 'In progress');
    expect(html).toContain(lang === 'es' ? 'hasta 10 intentos' : 'up to 10 attempts');
    expect(html).toContain(lang === 'es' ? 'auditoría externa' : 'external audit');
    // Not claimed until anyone can move their money without GatoPago (roadmap/SALIDA.md).
    expect(html).not.toMatch(/autocustodi|self-custod/i);
    // No promise of every wallet, no partners named, no old name.
    expect(html).not.toMatch(/cualquier wallet|any wallet|ATC|Red Enlace|PagoFácil|Flow/);
  });
});
