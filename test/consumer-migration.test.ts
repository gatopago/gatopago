import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss, { type AnyNode } from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { describe, expect, it, vi } from 'vitest';
import { AccountSettings } from '../src/consumer/AccountSettings';
import { withTexts } from './translations';
import { PrimaryNav } from '../src/consumer/PrimaryNav';
import { MoveMenu } from '../src/consumer/MoveMenu';

let searchParams = new URLSearchParams();
vi.mock('next/navigation', async (original) => ({
  ...(await original<typeof import('next/navigation')>()),
  usePathname: () => '/send',
  useRouter: () => ({ back: () => {}, replace: () => {} }),
  useSearchParams: () => searchParams,
}));

vi.mock('../src/marketing/MeliSprite', () => ({
  MeliSprite: () => createElement('span', { 'aria-hidden': true }),
}));

describe('Consumer presentation migration', () => {
  it('restores the four V2 navigation sections', () => {
    const html = renderToStaticMarkup(withTexts(createElement(PrimaryNav), 'en'));
    expect(html).toContain('href="/en/app"');
    expect(html).toContain('href="/en/move"');
    expect(html).toContain('href="/en/statement"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('href="/en/earn"');
  });
  it('opens receiving from Move with a request or the account', () => {
    searchParams = new URLSearchParams('flow=receive');
    const html = renderToStaticMarkup(withTexts(createElement(MoveMenu)));
    searchParams = new URLSearchParams();
    expect(html).toContain('href="/charge"');
    expect(html).toContain('href="/receive"');
    expect(html).toContain('Recibir dinero');
    expect(html).toContain('aria-label="Volver"');
  });
  it('retains deterministic Next settings destinations in both languages', () => {
    for (const locale of ['es', 'en'] as const) {
      const html = renderToStaticMarkup(
        withTexts(
          createElement(AccountSettings, {
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
            session: {
              token: 'session',
              expiresAt: 4102444800,
              userId: 'usr_test',
              wallet: {
                credentialId: 'credential',
                owner: '0x3333333333333333333333333333333333333333',
                address: '0x75464f762bc50d0A0B127ab5a085504BF102Bb88',
                initialOwners: [],
              },
            },
          }),
          locale,
        ),
      );
      expect(html).toContain(locale === 'en' ? 'aria-label="Back"' : 'aria-label="Volver"');
      // Security lives in the menu only, not repeated in Settings.
      expect(html).not.toContain('/settings/security');
      expect(html).toContain(`href="/${locale === 'en' ? 'es' : 'en'}/settings"`);
      expect(html).toContain('meli-paper-card');
      expect(html).not.toContain('workers.dev');
    }
  });
  it('isolates all consumer selectors from marketing', () => {
    const root = postcss.parse(readFileSync(resolve('src/consumer/consumer.css'), 'utf8'));
    root.walkRules((rule) => {
      for (let parent: AnyNode | undefined = rule.parent; parent; parent = parent.parent) {
        if (parent.type === 'atrule' && /keyframes$/.test(parent.name)) return;
      }
      for (const selector of rule.selectors) expect(selector).toContain('.consumer-ui');
    });
  });
  it('builds the original client tokens with the Next Tailwind integration', async () => {
    const from = resolve('src/app/base.css');
    const result = await postcss([tailwind()]).process(readFileSync(from, 'utf8'), { from });
    expect(result.css).toContain('--color-cat-500: #f85239');
    expect(result.css).not.toContain('@theme');
    expect(result.css).not.toContain('@import "tailwindcss"');
  });
  it('compiles landing Tailwind primitives without dropping custom animation rules', async () => {
    const from = resolve('src/marketing/landing.css');
    const result = await postcss([tailwind()]).process(readFileSync(from, 'utf8'), { from });
    expect(result.css).not.toContain('@apply');
    expect(result.css).toContain('.meli-button');
    expect(result.css).toContain('prefers-reduced-motion');
  });
});
