import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { unstable_doesMiddlewareMatch as unstable_doesProxyMatch } from 'next/experimental/testing/server';
import { documentCsp, documentSecurityHeaders } from '../src/security/content-policy';
import { NONCE_HEADER, validNonce } from '../src/security/nonce';
import { proxy, config } from '../src/proxy';
import { GET as missingPage } from '../src/app/[...missing]/route';

const nonce = Buffer.alloc(32, 7).toString('base64');
const defaults = {
  nonce,
  apiOrigin: 'https://api.gatopago.com',
  networks: ['eip155:421614', 'eip155:43113', 'eip155:10143'],
  rpcUrls: { 'eip155:421614': 'https://arb-sepolia.g.alchemy.com/v2/browser-key' },
  push: false,
  development: false,
  secure: true,
};
const directives = (value: string) =>
  Object.fromEntries(
    value.split('; ').map((part) => {
      const [name, ...sources] = part.split(' ');
      return [name, sources];
    }),
  );
afterEach(() => vi.unstubAllEnvs());

describe('Document CSP with per-response nonce', () => {
  it('serves a real 404 without framework or inline scripts, secrets, or an offline success fallback', async () => {
    const response = missingPage();
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    const html = await response.text();
    expect(html).toContain('Página no encontrada');
    expect(html).not.toMatch(/<script|<iframe|onerror=|onclick=|oobCode/);
  });
  it('rejects absent, malformed and injected nonces', () => {
    for (const value of [null, undefined, '', 'a', nonce + "'; script-src *", nonce + '\n'])
      expect(validNonce(value)).toBe(false);
    expect(() => documentCsp({ ...defaults, nonce: 'attacker' })).toThrow('nonce');
  });
  it('never enables inline/eval script execution or wildcard origins in a release', () => {
    const policy = directives(documentCsp(defaults));
    expect(policy['script-src']).toEqual([`'nonce-${nonce}'`, "'strict-dynamic'"]);
    expect(policy['script-src-attr']).toEqual(["'none'"]);
    expect(policy['default-src']).toEqual(["'none'"]);
    expect(policy['base-uri']).toEqual(["'none'"]);
    expect(policy['frame-ancestors']).toEqual(["'none'"]);
    expect(policy['worker-src']).toEqual(["'self'"]);
    expect(policy['connect-src']).toEqual([
      "'self'",
      'https://api.gatopago.com',
      'https://sepolia-rollup.arbitrum.io',
      'https://iris-api-sandbox.circle.com',
      'https://api.avax-test.network',
      'https://testnet-rpc.monad.xyz',
      'https://arb-sepolia.g.alchemy.com',
    ]);
    expect(policy['frame-src']).toEqual(["'self'", 'https://challenges.cloudflare.com']);
    expect(JSON.stringify(policy)).not.toMatch(/analytics|tagmanager|googleapis/);
    expect(policy['style-src']).toEqual(["'self'", `'nonce-${nonce}'`]);
    expect(policy['style-src-attr']).toEqual(["'unsafe-inline'"]);
    expect(documentCsp(defaults)).not.toContain('*');
    expect(documentSecurityHeaders['Cache-Control']).toContain('no-store');
    expect(documentSecurityHeaders['Cross-Origin-Opener-Policy']).toBe('same-origin');
  });
  it('reaches Firebase Cloud Messaging only when notifications are configured', () => {
    const policy = directives(documentCsp({ ...defaults, push: true }));
    expect(policy['connect-src'].filter((origin) => origin.includes('googleapis'))).toEqual([
      'https://firebaseinstallations.googleapis.com',
      'https://fcmregistrations.googleapis.com',
    ]);
  });
  it('allows eval and HMR only in development, without HTTPS upgrading loopback', () => {
    const policy = directives(documentCsp({ ...defaults, development: true, secure: false }));
    expect(policy['script-src']).toContain("'unsafe-eval'");
    expect(policy['script-src']).not.toContain("'unsafe-inline'");
    expect(policy['style-src']).toEqual(["'self'", "'unsafe-inline'"]);
    expect(policy['connect-src']).toContain('ws://localhost:3000');
    expect(policy['upgrade-insecure-requests']).toBeUndefined();
  });
  it('overwrites forged nonce/CSP headers and never reuses a nonce between requests', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const nonces = new Set<string>();
    for (let index = 0; index < 24; index++) {
      const request = new NextRequest('https://gatopago.com/login', {
        headers: {
          [NONCE_HEADER]: nonce,
          'Content-Security-Policy': "script-src * 'unsafe-inline'",
          RSC: '1',
          'Content-Security-Policy-Report-Only': 'script-src *',
          'next-router-prefetch': '1',
        },
      });
      const response = proxy(request);
      const value = response.headers.get('x-middleware-request-' + NONCE_HEADER)!;
      expect(validNonce(value)).toBe(true);
      expect(value).not.toBe(nonce);
      nonces.add(value);
      expect(response.headers.get('Content-Security-Policy')).toContain(`'nonce-${value}'`);
      expect(response.headers.get('x-middleware-request-content-security-policy')).toBe(
        response.headers.get('Content-Security-Policy'),
      );
      expect(
        response.headers.get('x-middleware-request-content-security-policy-report-only'),
      ).toBeNull();
      expect(response.headers.get('Cache-Control')).toContain('no-store');
    }
    expect(nonces.size).toBe(24);
  });
  it.each([
    '/',
    '/en',
    '/app',
    '/login',
    '/pay/demo-cafe-norte',
    '/missing',
    '/__/auth/iframe',
    '/offline-extra',
    '/_next/image-extra',
  ])('covers %s even with prefetch headers', (url) => {
    expect(
      unstable_doesProxyMatch({
        config,
        url,
        headers: { 'next-router-prefetch': '1', purpose: 'prefetch' },
      }),
    ).toBe(true);
  });
  it.each([
    '/_next/static/chunks/app.js',
    '/_next/image?url=%2Fpwa%2Ficon.png&w=256&q=75',
    '/pwa/icon.png',
    '/brand/meli.webp',
    '/favicon.svg',
    '/sw.js',
    '/offline',
    '/manifest.webmanifest',
  ])('leaves %s to its resource policy', (url) => {
    expect(unstable_doesProxyMatch({ config, url })).toBe(false);
  });
});
