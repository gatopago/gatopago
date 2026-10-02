import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// This installed Next release still exports the test helper under its middleware name.
import { unstable_doesMiddlewareMatch as unstable_doesProxyMatch } from 'next/experimental/testing/server';
import environments from '@gatopago/environment/environments.json';
import { parseEnvironment } from '@gatopago/environment';
import { documentCsp, documentSecurityHeaders } from '../src/security/content-policy';
import { NONCE_HEADER, validNonce } from '../src/security/nonce';
import { proxy, config } from '../src/proxy';
import { GET as missingPage } from '../src/app/[...missing]/route';

vi.mock('../src/auth/server-config', () => ({ webAuthConfig: () => ({ mode: 'disabled' }) }));
const environment = parseEnvironment(environments.staging);
const nonce = Buffer.alloc(32, 7).toString('base64');
const defaults = { nonce, environment, auth: { mode: 'disabled' as const }, development: false, secure: true };
const directives = (value: string) => Object.fromEntries(value.split('; ').map((part) => {
  const [name, ...sources] = part.split(' '); return [name, sources];
}));
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
    for (const value of [null, undefined, '', 'a', nonce + "'; script-src *", nonce + '\n']) expect(validNonce(value)).toBe(false);
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
    expect(policy['connect-src']).toEqual(["'self'", environment.api_origin]);
    expect(policy['style-src']).toEqual(["'self'", `'nonce-${nonce}'`]);
    expect(policy['style-src-attr']).toEqual(["'unsafe-inline'"]);
    expect(documentCsp(defaults)).not.toContain('*');
    expect(documentSecurityHeaders['Cache-Control']).toContain('no-store');
    expect(documentSecurityHeaders['Cross-Origin-Opener-Policy']).toBe('same-origin');
  });
  it('allows only the provisioned identity connections and Turnstile frame, never analytics', () => {
    const policy = directives(documentCsp({ ...defaults, auth: {
      deployment: environment, mode: 'firebase', environment: 'staging', webOrigin: environment.web_origin,
      firebase: { apiKey: 'public-fixture', appId: 'fixture', projectId: 'fixture', authDomain: 'staging.gatopago.com' },
      apiOrigin: environment.api_origin + '', turnstileSiteKey: 'fixture',
    } }));
    expect(policy['connect-src']).toEqual(["'self'", environment.api_origin,
      'https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com']);
    expect(policy['frame-src']).toEqual(["'self'", 'https://challenges.cloudflare.com']);
    expect(policy['script-src']).not.toContain("'unsafe-inline'");
    expect(JSON.stringify(policy)).not.toMatch(/analytics|tagmanager|walletconnect|reown/);
  });
  it('restricts eval/HMR and the emulator to development, without HTTPS upgrading loopback', () => {
    const auth = { deployment: environment, mode: 'emulator' as const, environment: 'staging' as const, webOrigin: 'http://localhost:3000',
      firebase: { apiKey: 'fake', appId: 'fixture', projectId: 'demo-fixture', authDomain: 'localhost' },
      apiOrigin: null, turnstileSiteKey: null };
    expect(() => documentCsp({ ...defaults, auth })).toThrow('release');
    const policy = directives(documentCsp({ ...defaults, auth, development: true, secure: false }));
    expect(policy['script-src']).toContain("'unsafe-eval'");
    expect(policy['script-src']).not.toContain("'unsafe-inline'");
    expect(policy['style-src']).toEqual(["'self'", "'unsafe-inline'"]);
    expect(policy['connect-src']).toContain('http://127.0.0.1:9099');
    expect(policy['connect-src']).toContain('ws://localhost:3000');
    expect(policy['upgrade-insecure-requests']).toBeUndefined();
  });
  it('overwrites forged nonce/CSP headers and never reuses a nonce between requests', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const nonces = new Set<string>();
    for (let index = 0; index < 24; index++) {
      const request = new NextRequest(environment.web_origin + '/login', { headers: {
        [NONCE_HEADER]: nonce, 'Content-Security-Policy': "script-src * 'unsafe-inline'", 'RSC': '1',
        'Content-Security-Policy-Report-Only': "script-src *", 'next-router-prefetch': '1',
      } });
      const response = proxy(request);
      const value = response.headers.get('x-middleware-request-' + NONCE_HEADER)!;
      expect(validNonce(value)).toBe(true);
      expect(value).not.toBe(nonce);
      nonces.add(value);
      expect(response.headers.get('Content-Security-Policy')).toContain(`'nonce-${value}'`);
      expect(response.headers.get('x-middleware-request-content-security-policy')).toBe(response.headers.get('Content-Security-Policy'));
      expect(response.headers.get('x-middleware-request-content-security-policy-report-only')).toBeNull();
      expect(response.headers.get('Cache-Control')).toContain('no-store');
    }
    expect(nonces.size).toBe(24);
  });
  it.each(['/', '/en', '/app', '/login', '/pay/demo-cafe-norte', '/missing', '/__/auth/iframe', '/offline-extra', '/_next/image-extra'])('covers %s even with prefetch headers', (url) => {
    expect(unstable_doesProxyMatch({ config, url, headers: { 'next-router-prefetch': '1', purpose: 'prefetch' } })).toBe(true);
  });
  it.each(['/_next/static/chunks/app.js', '/_next/image?url=%2Fpwa%2Ficon.png&w=256&q=75', '/pwa/icon.png', '/brand/meli.webp', '/favicon.svg', '/sw.js', '/offline', '/manifest.webmanifest'])('leaves %s to its resource policy', (url) => {
    expect(unstable_doesProxyMatch({ config, url })).toBe(false);
  });
});
