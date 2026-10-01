import type { Environment } from '@gatopago/environment';
import type { WebAuthConfig } from '../auth/config';
import { LOCAL_AUTH_ORIGIN, LOCAL_WEB_ORIGIN } from '../auth/config';
import { validNonce } from './nonce';

/** Inputs are validated build configuration, never request URLs or arbitrary origin lists. */
export function documentCsp(input: {
  nonce: string; environment: Environment; auth: WebAuthConfig; development: boolean; secure: boolean;
}): string {
  if (!validNonce(input.nonce)) throw new Error('Invalid CSP nonce');
  const { auth, development } = input;
  if (auth.mode === 'emulator' && (!development || input.environment.environment !== 'staging')) {
    throw new Error('Emulator CSP cannot enter a release');
  }
  const connections = ["'self'", input.environment.api_origin];
  const frames = ["'self'"];
  if (auth.mode === 'firebase') {
    connections.push('https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com');
    frames.push('https://challenges.cloudflare.com');
  }
  if (auth.mode === 'emulator') { connections.push(LOCAL_AUTH_ORIGIN); frames.push(LOCAL_AUTH_ORIGIN); }
  if (development) connections.push(LOCAL_WEB_ORIGIN.replace('http:', 'ws:'));
  return [
    "default-src 'none'",
    `script-src 'nonce-${input.nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    "script-src-attr 'none'",
    `style-src 'self' ${development ? "'unsafe-inline'" : `'nonce-${input.nonce}'`}`,
    // React style properties/animation geometry are used by UI. This does not allow inline scripts.
    "style-src-attr 'unsafe-inline'",
    `connect-src ${connections.join(' ')}`,
    `frame-src ${frames.join(' ')}`,
    "img-src 'self' data: blob:", "font-src 'self'", "manifest-src 'self'", "worker-src 'self'",
    "object-src 'none'", "media-src 'self' blob:", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'",
    ...(input.secure ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

export const documentSecurityHeaders = {
  'Cache-Control': 'private, no-store, max-age=0', 'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), payment=(), publickey-credentials-get=(self), publickey-credentials-create=(self)',
} as const;
