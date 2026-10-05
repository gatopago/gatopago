import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { settings } from './lib/settings';
import { documentCsp, documentSecurityHeaders } from './security/content-policy';
import { NONCE_HEADER } from './security/nonce';

export function proxy(request: NextRequest) {
  const nonce = randomBytes(32).toString('base64');
  const csp = documentCsp({
    nonce,
    apiOrigin: settings.apiOrigin,
    networks: settings.networks,
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
