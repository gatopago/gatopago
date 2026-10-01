import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss, { type AnyNode } from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { describe, expect, it, vi } from 'vitest';
import { AccountSettings } from '../src/consumer/AccountSettings';
import { BalanceCard } from '../src/consumer/BalanceCard';
import { parseBalanceView } from '../src/wallet/balances';
import { balanceFixture } from './balances.fixture';
import { PrimaryNav } from '../src/consumer/PrimaryNav';
import { MoveMenu } from '../src/consumer/MoveMenu';

vi.mock('next/navigation', () => ({ usePathname: () => '/send', useSearchParams: () => new URLSearchParams() }));
// Next's compiler supplies static image dimensions; Vitest's asset loader does not.
// The production build/browser checks cover the real sprite, this unit covers routing.
vi.mock('../src/marketing/MeliSprite', () => ({ MeliSprite: () => createElement('span', { 'aria-hidden': true }) }));

describe('Consumer presentation migration', () => {
  it('preserves all four Next navigation destinations', () => {
    const html = renderToStaticMarkup(createElement(PrimaryNav, { english: true }));
    expect(html).toContain('href="/app?lang=en"');
    expect(html).toContain('href="/move?lang=en"');
    expect(html).toContain('href="/statement?lang=en"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('href="/earn?lang=en"');
  });
  it('routes sending to Next without reusing V2 receive or swap actions', () => {
    const html = renderToStaticMarkup(createElement(MoveMenu, { english: false }));
    expect(html).toContain('href="/send"');
    expect(html).toContain('href="/move?flow=receive"');
    expect(html).toContain('href="/swap"');
    expect(html).toContain('href="/crosschain"');
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
  it('never displays an unavailable observation as a zero balance', () => {
    const html = renderToStaticMarkup(createElement(BalanceCard, { balance: null, network: 'Arbitrum Sepolia', english: false }));
    expect(html).toContain('Esto no significa que tu saldo sea cero');
    expect(html).toContain('—');
    expect(html).not.toContain('Disponible');
  });
  it('preserves atomic precision without floating point conversion', () => {
    const f = balanceFixture();
    const balance = parseBalanceView(f.wire, f.account, f.now);
    balance.assets = [{ ...balance.assets[1], amount_atomic: '9007199254740993123456', decimals: 6 }];
    const html = renderToStaticMarkup(createElement(BalanceCard, { balance, network: 'Arbitrum Sepolia', english: true }));
    expect(html).toContain('9007199254740993.123456');
    expect(html).toContain('Onchain balance');
    expect(html).not.toContain('available to spend');
  });
  it('keeps observed zero distinct from unavailable', () => {
    const f = balanceFixture();
    const balance = parseBalanceView(f.wire, f.account, f.now);
    balance.assets = [balance.assets[0]];
    const html = renderToStaticMarkup(createElement(BalanceCard, { balance, network: 'Arbitrum Sepolia', english: true }));
    expect(html).toMatch(/>0<\/p>/);
    expect(html).not.toContain('No current observation');
  });
  it('isolates all consumer selectors from marketing', () => {
    const root = postcss.parse(readFileSync(resolve('src/consumer/consumer.css'), 'utf8'));
    root.walkRules(rule => {
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
