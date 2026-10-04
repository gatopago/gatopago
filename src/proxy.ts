import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { webAuthConfig } from './auth/server-config';
import { environment } from './lib/brand';
import { documentCsp, documentSecurityHeaders } from './security/content-policy';
import { NONCE_HEADER } from './security/nonce';

export function proxy(request: NextRequest) {
  const auth = webAuthConfig();
  const nonce = randomBytes(32).toString('base64');
  const csp = documentCsp({
    nonce,
    environment,
    auth,
    development: process.env.NODE_ENV === 'development',
    secure: request.nextUrl.protocol === 'https:',
  });
  const headers = new Headers(request.headers);
  // Never trust a caller-supplied nonce/CSP, including requests labelled as prefetch/RSC.
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
  // No header-based exemption: spoofing a prefetch header must not remove protection.
  matcher: [
    '/((?!_next/static/|_next/image(?:/|$)|brand/|pwa/|sw\\.js$|manifest\\.webmanifest$|offline$|favicon\\.(?:svg|ico)$|og\\.png$|Logo_gatopago\\.svg$|apple-touch-icon\\.png$).*)',
  ],
};
