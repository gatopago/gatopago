import { randomBytes } from 'node:crypto';
import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { settings } from './lib/settings';
import { documentCsp, documentSecurityHeaders } from './security/content-policy';
import { NONCE_HEADER } from './security/nonce';
import { STATIC_PAGES, staticCsp, staticSecurityHeaders } from './security/static-pages';

/** The address's language (`/en/…`), or the browser's on a first visit: next-intl's own routing. */
const i18nRouting = createMiddleware(routing);

/**
 * Links from before English had its own addresses (`/statement?lang=en`, in notifications already
 * delivered and bookmarks) open in English, whatever the browser prefers.
 */
function englishAddress({ nextUrl }: NextRequest) {
  if (nextUrl.searchParams.get('lang') !== 'en') return null;
  const url = nextUrl.clone();
  url.searchParams.delete('lang');
  if (!/^\/en(\/|$)/.test(url.pathname)) url.pathname = `/en${url.pathname.replace(/\/$/, '')}`;
  return NextResponse.redirect(url, 307);
}

export function proxy(request: NextRequest) {
  const english = englishAddress(request);
  if (english) return english;
  // Prerendered pages carry no nonce: their own policy, and the CDN may keep them.
  if (STATIC_PAGES.has(request.nextUrl.pathname)) {
    const response = i18nRouting(request);
    response.headers.set(
      'Content-Security-Policy',
      staticCsp({
        development: process.env.NODE_ENV === 'development',
        secure: request.nextUrl.protocol === 'https:',
      }),
    );
    for (const [name, value] of Object.entries(staticSecurityHeaders))
      response.headers.set(name, value);
    return response;
  }
  const nonce = randomBytes(32).toString('base64');
  const csp = documentCsp({
    nonce,
    apiOrigin: settings.apiOrigin,
    networks: settings.networks,
    rpcUrls: settings.rpcUrls,
    stellar: settings.stellar,
    push: settings.push !== null,
    development: process.env.NODE_ENV === 'development',
    secure: request.nextUrl.protocol === 'https:',
  });
  // The page reads them from its request: next-intl passes the request's headers on.
  request.headers.set(NONCE_HEADER, nonce);
  request.headers.set('Content-Security-Policy', csp);
  request.headers.delete('Content-Security-Policy-Report-Only');
  const response = i18nRouting(request);
  response.headers.set('Content-Security-Policy', csp);
  for (const [name, value] of Object.entries(documentSecurityHeaders))
    response.headers.set(name, value);
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static/|_next/image(?:/|$)|brand/|pwa/|tokens/|sw\\.js$|manifest\\.webmanifest$|offline$|favicon\\.(?:svg|ico)$|og/|Logo_gatopago\\.svg$|apple-touch-icon\\.png$).*)',
  ],
};
