import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { consumerAliases, consumerRoutes, localizedPath } from '../src/consumer/routes';
import { parseConsumerQr, qrReviewPath, reviewedRecipient } from '../src/consumer/qr';
import { ChargeScreen, ReceiveScreen, SwapScreen, CrosschainScreen, EarnScreen } from '../src/consumer/PaymentScreens';
import { ContactsScreen, ProfileScreen, RecoveryScreen, TestFundsScreen, OnboardingScreen } from '../src/consumer/AccountScreens';
import { PublicPayment } from '../src/consumer/PublicPayment';

vi.mock('../src/marketing/MeliSprite', () => ({ MeliSprite: () => createElement('span', { 'aria-hidden': true }) }));
vi.mock('../src/marketing/CatGlyph', () => ({ CatGlyph: () => createElement('span') }));
vi.mock('../src/pwa/PwaControls', () => ({ PwaControls: () => null }));
vi.mock('next/navigation', () => ({ usePathname: () => '/app' }));

describe('Next migration inventory', () => {
  it.each(Object.entries(consumerRoutes))('%s has its own App Router entry for %s', (path, view) => {
    const file = resolve(`src/app/(es)${path}/page.tsx`);
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, 'utf8')).toContain(`view="${view}"`);
  });
  it.each(Object.entries(consumerAliases))('%s has a deterministic alias to %s', (path, target) => {
    expect(readFileSync(resolve(`src/app/(es)${path}/page.tsx`), 'utf8')).toContain(`redirect('${target}'`);
  });
  it('contains no Vite, React Router, original client imports or V2 monetary endpoints in Next consumer source', () => {
    const walk = (path: string): string[] => readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(resolve(path, entry.name)) : /\.(tsx?|css)$/.test(entry.name) ? [resolve(path, entry.name)] : []);
    for (const file of walk(resolve('src/consumer'))) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/import\.meta|from ['"]react-router|from ['"][^'"]*client\/src|\/pay\/submit|\/pay\/prepare|window\.ethereum|workers\.dev/);
    }
  });
  it('preserves existing query parameters and replaces the locale once', () => {
    expect(localizedPath('/move?flow=receive&lang=es', true)).toBe('/move?flow=receive&lang=en');
    expect(localizedPath('/move?flow=receive&lang=en', false)).toBe('/move?flow=receive');
  });
  it.each([ChargeScreen, ReceiveScreen, SwapScreen, CrosschainScreen, EarnScreen, ContactsScreen, ProfileScreen, RecoveryScreen, TestFundsScreen])('renders an honest unavailable form without services', Component => {
    for (const english of [true, false]) {
      const html = renderToStaticMarkup(createElement(Component, { english }));
      if (Component !== RecoveryScreen) {
        if (Component !== ContactsScreen) expect(html).toContain('disabled=""');
        expect(html).toContain(english ? 'not connected to V3' : 'todavía no está conectada a V3');
      } else {
        expect(html).toContain(english ? 'access is lost permanently' : 'pierdes el acceso definitivamente');
        expect(html).not.toContain(english ? 'Review my recovery policy' : 'Revisar mi política de recuperación');
      }
      expect(html).not.toMatch(/0\.00 USDC|Payment completed|Pago completado/);
    }
  });
  it('onboarding directs the user to Security, without starting enrollment', () => {
    const html = renderToStaticMarkup(createElement(OnboardingScreen, { english: false }));
    expect(html).toContain('href="/settings/security"');
    expect(html).not.toContain('48 horas');
  });
  it('never treats a public URL as verified payment evidence and escapes its reference', () => {
    const html = renderToStaticMarkup(createElement(PublicPayment, { english: false, reference: '<script>paid()</script>', kind: 'status' }));
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('No verificamos');
    expect(html).not.toContain('<script>paid()');
  });
});

describe('Untrusted QR review', () => {
  const origin = 'https://staging.gatopago.com';
  const address = '0x1111111111111111111111111111111111111111';
  it.each([address, `eip155:421614:${address}`, `ethereum:${address}@421614?value=999999&gas=1`, `ethereum:${address}@421614/transfer?address=${address}&uint256=9000`])('extracts only a recipient from %s', value => {
    const result = parseConsumerQr(value, origin);
    expect(result?.kind).toBe('address');
    expect(result && qrReviewPath(result)).not.toMatch(/value|amount|uint256|gas/);
  });
  it.each(['javascript:alert(1)', '//evil.example/pay/a', 'https://evil.example/pay/a', '/\\evil.example/pay/a', '/login?oobCode=x', '/settings/security', 'https://app.parmelia.me/pay/a', '/pay/a?amount=100&to=evil'])('rejects or strips untrusted instructions in %s', value => {
    const result = parseConsumerQr(value, origin);
    if (result) expect(result).toEqual({ kind: 'link', path: '/pay/a' });
    else expect(result).toBeNull();
  });
  it('accepts canonical username links without trusting a supplied destination', () => {
    expect(parseConsumerQr('/@Daniel_1?to=evil', origin)).toEqual({ kind: 'link', path: '/@Daniel_1' });
    for (const path of ['/@a', '/@0daniel', '/@dan-iel']) expect(parseConsumerQr(path, origin)).toBeNull();
  });
  it('rejects duplicated ERC-681 recipients and unsupported functions', () => {
    expect(parseConsumerQr(`ethereum:${address}/transfer?address=${address}&address=${address}`, origin)).toBeNull();
    expect(parseConsumerQr(`ethereum:${address}/approve?address=${address}`, origin)).toBeNull();
  });
  it('keeps only the id in a historical query link', () => {
    expect(parseConsumerQr('/pay?id=invoice_123&amount=900', origin)).toEqual({ kind: 'link', path: '/pay/invoice_123' });
  });
  it('does not prefill a recipient for the wrong selected network', () => {
    const params = new URLSearchParams({ recipient: address, chain: '1' });
    expect(reviewedRecipient(params, 'eip155:421614')).toBe('');
    params.set('chain', '421614');
    expect(reviewedRecipient(params, 'eip155:421614')).toBe(address);
  });
});
