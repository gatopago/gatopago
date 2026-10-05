import { walletNetwork } from '@gatopago/shared/networks';
import { validNonce } from './nonce';

/** RPC endpoints the browser reads balances and account state from. */
function rpcOrigins(networks: readonly string[]): string[] {
  return networks.flatMap((id) =>
    walletNetwork(id).chain.rpcUrls.default.http.map((url) => new URL(url).origin),
  );
}

export function documentCsp(input: {
  nonce: string;
  apiOrigin: string;
  networks: readonly string[];
  development: boolean;
  secure: boolean;
}): string {
  if (!validNonce(input.nonce)) throw new Error('Invalid CSP nonce');
  const { development } = input;
  const connections = ["'self'", input.apiOrigin, ...rpcOrigins(input.networks)];
  if (development) connections.push('ws://localhost:3000');
  return [
    "default-src 'none'",
    `script-src 'nonce-${input.nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    "script-src-attr 'none'",
    `style-src 'self' ${development ? "'unsafe-inline'" : `'nonce-${input.nonce}'`}`,

    "style-src-attr 'unsafe-inline'",
    `connect-src ${connections.join(' ')}`,
    "frame-src 'self' https://challenges.cloudflare.com",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "media-src 'self' blob:",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(input.secure ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

export const documentSecurityHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy':
    'camera=(self), microphone=(), geolocation=(), payment=(), publickey-credentials-get=(self), publickey-credentials-create=(self)',
} as const;
