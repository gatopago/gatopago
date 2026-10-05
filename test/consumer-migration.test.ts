import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss, { type AnyNode } from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { describe, expect, it, vi } from 'vitest';
import { AccountSettings } from '../src/consumer/AccountSettings';
import { PrimaryNav } from '../src/consumer/PrimaryNav';
import { MoveMenu } from '../src/consumer/MoveMenu';

let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  usePathname: () => '/send',
  useRouter: () => ({ replace: () => {} }),
  useSearchParams: () => searchParams,
}));

vi.mock('../src/marketing/MeliSprite', () => ({
  MeliSprite: () => createElement('span', { 'aria-hidden': true }),
}));

describe('Consumer presentation migration', () => {
  it('restores the four V2 navigation sections', () => {
    const html = renderToStaticMarkup(createElement(PrimaryNav, { english: true }));
    expect(html).toContain('href="/app?lang=en"');
    expect(html).toContain('href="/move?lang=en"');
    expect(html).toContain('href="/statement?lang=en"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('href="/earn?lang=en"');
  });
  it('opens receiving from Move with a request or the account', () => {
    searchParams = new URLSearchParams('flow=receive');
    const html = renderToStaticMarkup(createElement(MoveMenu, { english: false }));
    searchParams = new URLSearchParams();
    expect(html).toContain('href="/charge"');
    expect(html).toContain('href="/receive"');
    expect(html).toContain('Volver a Mover');
  });
  it('retains deterministic Next settings destinations in both languages', () => {
    for (const english of [false, true]) {
      const html = renderToStaticMarkup(
        createElement(AccountSettings, {
          english,
          settings: {
            webOrigin: 'https://gatopago.com',
            apiOrigin: 'https://api.gatopago.com',
            networks: ['eip155:421614'],
            homeNetwork: 'eip155:421614',
            rpcUrls: {},
            turnstileSiteKey: '1x00000000000000000000AA',
            push: null,
          },
          session: {
            token: 'session',
            expiresAt: 4102444800,
            userId: 'usr_test',
            wallet: {
              credentialId: 'credential',
              publicKey: `0x${'11'.repeat(64)}`,
              address: '0x75464f762bc50d0A0B127ab5a085504BF102Bb88',
              initialOwners: [],
            },
          },
        }),
      );
      const suffix = english ? '?lang=en' : '';
      expect(html).toContain(`href="/app${suffix}"`);
      expect(html).toContain(`href="/settings/security${suffix}"`);
      expect(html).toContain('meli-paper-card');
      expect(html).toContain('btn btn-primary btn-block');
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
