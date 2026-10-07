import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../src/proxy';
import { NONCE_HEADER } from '../src/security/nonce';
import { STATIC_PAGES, staticCsp } from '../src/security/static-pages';

/** Every page.tsx under a route group, as the URL it serves. */
function pages(root: string): { path: string; file: string }[] {
  return readdirSync(root, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name === 'page.tsx')
    .map((entry) => {
      const file = join(entry.parentPath, entry.name);
      const segments = file
        .slice(root.length)
        .split(/[\\/]/)
        .filter((segment) => segment && segment !== 'page.tsx' && !/^\(.*\)$/.test(segment));
      return { path: '/' + segments.join('/'), file };
    });
}

const staticPages = [...pages('src/app/(static)'), ...pages('src/app/(en)')];
const directives = (value: string) =>
  Object.fromEntries(
    value.split('; ').map((part) => {
      const [name, ...sources] = part.split(' ');
      return [name, sources];
    }),
  );
afterEach(() => vi.unstubAllEnvs());

describe('Static public pages', () => {
  it('lists exactly the pages of the static route groups', () => {
    expect(new Set(staticPages.map(({ path }) => path))).toEqual(STATIC_PAGES);
  });

  it.each(staticPages)('keeps $path free of per-request input', ({ file }) => {
    expect(readFileSync(file, 'utf8')).not.toMatch(
      /searchParams|headers\(|cookies\(|force-dynamic|requestNonce/,
    );
  });

  it('allows inline scripts from this site only: no eval, no other origin, nothing to frame', () => {
    const policy = directives(staticCsp({ development: false, secure: true }));
    expect(policy['script-src']).toEqual(["'self'", "'unsafe-inline'"]);
    expect(policy['script-src-attr']).toEqual(["'none'"]);
    expect(policy['connect-src']).toEqual(["'self'"]);
    expect(policy['default-src']).toEqual(["'none'"]);
    expect(policy['frame-ancestors']).toEqual(["'none'"]);
    expect(policy['base-uri']).toEqual(["'none'"]);
    expect(policy['upgrade-insecure-requests']).toEqual([]);
    expect(staticCsp({ development: false, secure: true })).not.toMatch(/\*|https?:|eval/);
  });

  it('serves static pages without a nonce or "never cache", and the app as before', () => {
    vi.stubEnv('NODE_ENV', 'production');
    for (const path of STATIC_PAGES) {
      const response = proxy(new NextRequest(`https://gatopago.com${path}`));
      expect(response.headers.get('Content-Security-Policy')).toBe(
        staticCsp({ development: false, secure: true }),
      );
      expect(response.headers.get('x-middleware-request-' + NONCE_HEADER)).toBeNull();
      expect(response.headers.get('Cache-Control')).toBeNull();
      expect(response.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    }
    for (const path of ['/app', '/login', '/pay/pi_0123', '/@dani', '/docs/extra', '/en/app']) {
      const response = proxy(new NextRequest(`https://gatopago.com${path}`));
      expect(response.headers.get('Content-Security-Policy')).toContain("'nonce-");
      expect(response.headers.get('Cache-Control')).toContain('no-store');
    }
  });
});
