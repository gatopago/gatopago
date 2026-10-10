import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CatGlyph } from '../src/marketing/CatGlyph';
import { MeliSprite } from '../src/marketing/MeliSprite';
import { PasskeyAccess } from '../src/auth/PasskeyAccess';
import { PwaControls } from '../src/pwa/PwaControls';
import { pwaMetadata } from '../src/pwa/manifest';
import { withTexts } from './translations';

vi.mock('next/navigation', async (original) => ({
  ...(await original<typeof import('next/navigation')>()),
  useRouter: () => ({}),
  usePathname: () => '/login',
  useSearchParams: () => new URLSearchParams(),
}));

describe('Unified GatoPago presentation', () => {
  it('uses the official symbol instead of redrawing the logo', () => {
    const html = renderToStaticMarkup(createElement(CatGlyph));
    expect(html).toContain('src="/Logo_gatopago.svg"');
    expect(html).toContain('alt="GatoPago"');
    expect(readFileSync('public/Logo_gatopago.svg', 'utf8')).toContain('viewBox="0 0 30 23"');
    expect(renderToStaticMarkup(createElement(CatGlyph, { decorative: true }))).toContain('alt=""');
  });

  it('renders all 14 package sprites with explicit native dimensions', () => {
    const dimensions = {
      'body-conveyor': [477, 420],
      'body-courier': [430, 428],
      'body-peek-card': [435, 443],
      'body-qr': [348, 466],
      'body-sitting': [304, 429],
      'body-sleeping': [427, 343],
      'head-cautious': [376, 280],
      'head-curious': [366, 349],
      'head-excited': [332, 332],
      'head-focused': [330, 314],
      'head-happy': [329, 314],
      'head-neutral': [330, 314],
      'head-peek': [204, 343],
      'head-sleepy': [343, 314],
    } as const;
    for (const variant of Object.keys(dimensions) as (keyof typeof dimensions)[]) {
      const html = renderToStaticMarkup(createElement(MeliSprite, { variant }));
      expect(html).toContain(`width="${dimensions[variant][0]}"`);
      expect(html).toContain(`height="${dimensions[variant][1]}"`);
      expect(html).toContain('aria-hidden="true"');
    }
  });

  it('keeps shared landing selectors scoped so they cannot override the app after navigation', () => {
    const css = readFileSync('src/marketing/landing.css', 'utf8');
    expect(css).toContain(':where(.meli-landing, .meli-dialog) .meli-sprite,');
    expect(css).not.toMatch(
      /(?:^|[},])\s*\.meli-(?:sprite(?:__image)?|kicker(?:--\w+)?|avatar)(?:\s|[,{])/,
    );
  });

  it('loads app styles with the app frame, not the shared document', () => {
    const document = readFileSync('src/app/Document.tsx', 'utf8');
    const frame = readFileSync('src/consumer/ConsumerFrame.tsx', 'utf8');
    for (const sheet of ['consumer.css', 'auth.css']) {
      expect(document).not.toContain(sheet);
      expect(frame).toContain(sheet);
    }
  });

  it('keeps the cat and tagline beside the sign-in options', () => {
    const html = renderToStaticMarkup(
      withTexts(
        createElement(PasskeyAccess, {
          settings: {
            webOrigin: 'https://gatopago.com',
            apiOrigin: 'https://api.gatopago.com',
            businessOrigin: 'https://business.gatopago.com',
            networks: ['eip155:421614'],
            homeNetwork: 'eip155:421614',
            rpcUrls: {},
            turnstileSiteKey: '1x00000000000000000000AA',
            meraSessionMinutes: 15,
            passkeyRpId: 'localhost',
            stellar: null,
            push: null,
          },
          onSignedIn: () => {},
        }),
      ),
    );
    // auth.css hides the hero art unless the panel shows the access options.
    expect(html).toContain('auth-panel auth-panel--access-options');
    expect(html).toContain('Iniciar sesión');
  });

  it('keeps the compact installation control accessible and the proper web icon formats', () => {
    const html = renderToStaticMarkup(withTexts(createElement(PwaControls, { compact: true })));
    expect(html).toContain('aria-label="Instalar app"');
    expect(html).toContain('pwa-controls--compact');
    expect(JSON.stringify(pwaMetadata.icons)).toContain('image/svg+xml');
    expect(JSON.stringify(pwaMetadata.icons)).toContain('image/x-icon');
    const apple = readFileSync('public/apple-touch-icon.png');
    expect(apple.readUInt32BE(16)).toBe(180);
    expect(apple.readUInt32BE(20)).toBe(180);
    expect(readFileSync('public/favicon.svg', 'utf8')).not.toContain('Gradient');
  });
});
