import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FlowPage } from '../src/marketing/FlowPage';
import english from '../src/messages/en.json';
import spanish from '../src/messages/es.json';
import { withTexts } from './translations';

/** `/flow` in `lang`, with its texts as the page reads them from the catalog. */
const page = (lang: 'es' | 'en') =>
  renderToStaticMarkup(
    withTexts(
      createElement(FlowPage, { lang, copy: (lang === 'en' ? english : spanish).Flow }),
      lang,
    ),
  );

vi.mock('../src/marketing/MeliSprite', () => ({
  MeliSprite: ({ variant }: { variant: string }) =>
    createElement('span', { 'data-meli-variant': variant, 'aria-hidden': true }),
}));

describe('Flow page', () => {
  it.each(['es', 'en'] as const)('says in %s only what Flow does today', (lang) => {
    const html = page(lang);
    for (const id of ['hero', 'how', 'steps', 'gets', 'not-yet'])
      expect(html).toContain(`id="${id}"`);
    expect(html).toContain('href="https://business.gatopago.com"');
    expect(html).toContain(lang === 'es' ? 'href="/docs"' : 'href="/en/docs"');
    expect(html).toContain(
      lang === 'es' ? 'GatoPago nunca tiene tu dinero' : 'GatoPago never holds your money',
    );
    expect(html).toContain(lang === 'es' ? 'hasta 10 reintentos' : 'up to 10 retries');
    expect(html).toContain(lang === 'es' ? 'auditoría externa' : 'external audit');
    // Not claimed until anyone can move their money without GatoPago (roadmap/SALIDA.md).
    expect(html).not.toMatch(/autocustodi|self-custod/i);
    // AUSD charges are not deployed yet.
    expect(html).not.toContain('AUSD');
  });
});
