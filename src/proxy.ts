import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { settings } from './lib/settings';
import { documentCsp, documentSecurityHeaders } from './security/content-policy';
import { NONCE_HEADER } from './security/nonce';
import { STATIC_PAGES, staticCsp, staticSecurityHeaders } from './security/static-pages';

export function proxy(request: NextRequest) {
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
