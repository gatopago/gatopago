import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { consumerRoutes, localizedPath } from '../src/consumer/routes';
import { parseConsumerQr, qrReviewPath, reviewedRecipient } from '../src/consumer/qr';
import { RecoveryScreen } from '../src/consumer/AccountScreens';
import { MoveMenu } from '../src/consumer/MoveMenu';

vi.mock('../src/marketing/MeliSprite', () => ({
  MeliSprite: () => createElement('span', { 'aria-hidden': true }),
}));
vi.mock('../src/marketing/CatGlyph', () => ({ CatGlyph: () => createElement('span') }));
vi.mock('../src/pwa/PwaControls', () => ({ PwaControls: () => null }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/app',
  useSearchParams: () => new URLSearchParams(),
}));

describe('Next migration inventory', () => {
  it.each(Object.entries(consumerRoutes))(
    '%s has its own App Router entry for %s',
    (path, view) => {
      const file = resolve(`src/app/(es)${path}/page.tsx`);
      expect(existsSync(file)).toBe(true);
      expect(readFileSync(file, 'utf8')).toContain(`view="${view}"`);
    },
  );
  it('contains no Vite, React Router, original client imports or V2 monetary endpoints in Next consumer source', () => {
    const walk = (path: string): string[] =>
      readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? walk(resolve(path, entry.name))
          : /\.(tsx?|css)$/.test(entry.name)
            ? [resolve(path, entry.name)]
            : [],
      );
    for (const file of walk(resolve('src/consumer'))) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(
        /import\.meta|from ['"]react-router|from ['"][^'"]*client\/src|\/pay\/submit|\/pay\/prepare|window\.ethereum|workers\.dev/,
      );
    }
  });
  it('preserves existing query parameters and replaces the locale once', () => {
    expect(localizedPath('/move?flow=receive&lang=es', true)).toBe('/move?flow=receive&lang=en');
    expect(localizedPath('/move?flow=receive&lang=en', false)).toBe('/move?flow=receive');
  });
  it.each([
    '/charge',
    '/swap',
    '/crosschain',
    '/earn',
    '/contacts',
    '/test-funds',
    '/pay/[linkId]',
  ])('removes the disconnected page %s rather than presenting an empty product', (path) => {
    expect(existsSync(resolve(`src/app/(es)${path}/page.tsx`))).toBe(false);
    expect(consumerRoutes).not.toHaveProperty(path);
    expect(readFileSync('src/app/[...missing]/route.ts', 'utf8')).toContain('status: 404');
  });
  it('keeps the marketing receipt separate from consumer payment routes', () => {
    expect(existsSync(resolve('src/app/(es)/pay/demo-cafe-norte/page.tsx'))).toBe(true);
    expect(consumerRoutes).not.toHaveProperty('/pay/demo-cafe-norte');
    expect(parseConsumerQr('/pay/demo-cafe-norte', 'https://gatopago.com')).toBeNull();
  });
  it('does not advertise unavailable payment actions as links in Move', () => {
    const html = renderToStaticMarkup(createElement(MoveMenu, { english: false }));
    expect(html).not.toContain('Aún no disponible');
    expect(html).not.toMatch(/href="\/(charge|swap|crosschain)(\?|"|\/)/);
  });
  it('explains permanent loss of access without presenting a recovery form', () => {
    for (const english of [true, false]) {
      const html = renderToStaticMarkup(createElement(RecoveryScreen, { english }));
      expect(html).toContain(
        english ? 'access is lost permanently' : 'pierdes el acceso definitivamente',
      );
      expect(html).not.toMatch(/<(input|select)\b/);
      expect(html).not.toMatch(/0\.00 USDC|Payment completed|Pago completado/);
    }
  });
});

describe('Untrusted QR review', () => {
  const origin = 'https://gatopago.com';
  const address = '0x1111111111111111111111111111111111111111';
  it.each([
    address,
    `eip155:421614:${address}`,
    `ethereum:${address}@421614?value=999999&gas=1`,
    `ethereum:${address}@421614/transfer?address=${address}&uint256=9000`,
  ])('extracts only a recipient from %s', (value) => {
    const result = parseConsumerQr(value, origin);
    expect(result?.kind).toBe('address');
    expect(result && qrReviewPath(result)).not.toMatch(/value|amount|uint256|gas/);
  });
  it.each([
    'javascript:alert(1)',
    '//evil.example/pay/a',
    'https://evil.example/pay/a',
    '/\\evil.example/pay/a',
    '/login?oobCode=x',
    '/settings/security',
    'https://app.parmelia.me/pay/a',
    '/pay/a?amount=100&to=evil',
    '/pay/a',
    `${origin}/pay/demo-cafe-norte`,
  ])('rejects unsupported or untrusted instructions in %s', (value) => {
    expect(parseConsumerQr(value, origin)).toBeNull();
  });
  it('accepts canonical username links without trusting a supplied destination', () => {
    expect(parseConsumerQr('/@Daniel_1?to=evil', origin)).toEqual({
      kind: 'link',
      path: '/@Daniel_1',
    });
    for (const path of ['/@ana', '/@leo', '/@dani', `/@${'a'.repeat(30)}`]) {
      expect(parseConsumerQr(`${path}?to=evil`, origin)).toEqual({ kind: 'link', path });
    }
    for (const path of ['/@a', '/@ab', `/@${'a'.repeat(31)}`, '/@0daniel', '/@dan-iel'])
      expect(parseConsumerQr(path, origin)).toBeNull();
  });
  it('rejects duplicated ERC-681 recipients and unsupported functions', () => {
    expect(
      parseConsumerQr(`ethereum:${address}/transfer?address=${address}&address=${address}`, origin),
    ).toBeNull();
    expect(parseConsumerQr(`ethereum:${address}/approve?address=${address}`, origin)).toBeNull();
  });
  it('rejects the removed query-string payment format', () => {
    expect(parseConsumerQr('/pay?id=invoice_123&amount=900', origin)).toBeNull();
  });
  it('does not prefill a recipient for the wrong selected network', () => {
    const params = new URLSearchParams({ recipient: address, chain: '1' });
    expect(reviewedRecipient(params, 'eip155:421614')).toBe('');
    params.set('chain', '421614');
    expect(reviewedRecipient(params, 'eip155:421614')).toBe(address);
  });
});
