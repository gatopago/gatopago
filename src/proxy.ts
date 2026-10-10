import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { englishLocation, LANGUAGE_COOKIE, preferredLanguage } from './lib/language';
import { settings } from './lib/settings';
import { documentCsp, documentSecurityHeaders } from './security/content-policy';
import { NONCE_HEADER } from './security/nonce';
import { STATIC_PAGES, staticCsp, staticSecurityHeaders } from './security/static-pages';

/**
 * A page opened without a language, by someone who chose English or whose browser prefers it,
 * goes to its English version. Only full page loads (GET or HEAD of a document), never Next's
 * own fetches; a 307, because where it goes depends on who asks. No browser preference (most
 * crawlers) keeps the Spanish default, and a choice made with a language switch always wins.
 */
function languageRedirect(request: NextRequest) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const { headers, nextUrl } = request;
  if (headers.has('rsc') || headers.has('next-router-prefetch') || nextUrl.searchParams.has('_rsc'))
    return null;
  const destination = headers.get('sec-fetch-dest');
  if (destination ? destination !== 'document' : !headers.get('accept')?.includes('text/html'))
    return null;
  const chosen = request.cookies.get(LANGUAGE_COOKIE)?.value;
  const language =
    chosen === 'es' || chosen === 'en' ? chosen : preferredLanguage(headers.get('accept-language'));
  if (language !== 'en') return null;
  const target = englishLocation(nextUrl.pathname, nextUrl.searchParams);
  return target ? NextResponse.redirect(new URL(target, request.url), 307) : null;
}

export function proxy(request: NextRequest) {
  const english = languageRedirect(request);
  if (english) return english;
  // Prerendered pages carry no nonce: their own policy, and the CDN may keep them.
  if (STATIC_PAGES.has(request.nextUrl.pathname)) {
    const response = NextResponse.next();
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
  const headers = new Headers(request.headers);

  headers.set(NONCE_HEADER, nonce);
  headers.set('Content-Security-Policy', csp);
  headers.delete('Content-Security-Policy-Report-Only');
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  for (const [name, value] of Object.entries(documentSecurityHeaders))
    response.headers.set(name, value);
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static/|_next/image(?:/|$)|brand/|pwa/|sw\\.js$|manifest\\.webmanifest$|offline$|favicon\\.(?:svg|ico)$|og\\.png$|Logo_gatopago\\.svg$|apple-touch-icon\\.png$).*)',
  ],
};
