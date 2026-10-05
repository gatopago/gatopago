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

vi.mock('next/navigation', () => ({
  usePathname: () => '/send',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../src/marketing/MeliSprite', () => ({
  MeliSprite: () => createElement('span', { 'aria-hidden': true }),
}));

describe('Consumer presentation migration', () => {
  it('offers only connected destinations in the main navigation', () => {
    const html = renderToStaticMarkup(createElement(PrimaryNav, { english: true }));
    expect(html).toContain('href="/app?lang=en"');
    expect(html).toContain('href="/move?lang=en"');
    expect(html).toContain('href="/scan?lang=en"');
    expect(html).not.toMatch(/href="\/(grow|statement)/);
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain('href="/earn?lang=en"');
  });
  it('keeps unavailable actions out of the interactive Move links', () => {
    const html = renderToStaticMarkup(createElement(MoveMenu, { english: false }));
    expect(html).toContain('href="/send"');
    expect(html).toContain('href="/receive"');
    expect(html).not.toContain('Aún no disponible');
    expect(html).not.toMatch(/href="\/(charge|swap|crosschain)(\?|"|\/)/);
  });
  it('retains deterministic Next settings destinations in both languages', () => {
    for (const english of [false, true]) {
      const html = renderToStaticMarkup(createElement(AccountSettings, { english }));
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
