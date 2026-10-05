import { walletNetwork } from '@gatopago/shared/networks';
import { validNonce } from './nonce';

/**
 * What the browser reads directly: each network's RPCs, public and configured (balances, account
 * state), and Circle's Iris API (cross-network fees).
 */
function networkOrigins(
  networks: readonly string[],
  rpcUrls: Readonly<Record<string, string>>,
): string[] {
  const origins = networks.flatMap((id) => {
    const { chain } = walletNetwork(id);
    return [
      ...chain.rpcUrls.default.http.map((url) => new URL(url).origin),
      chain.testnet ? 'https://iris-api-sandbox.circle.com' : 'https://iris-api.circle.com',
    ];
  });
  for (const url of Object.values(rpcUrls)) origins.push(new URL(url).origin);
  return [...new Set(origins)];
}

export function documentCsp(input: {
  nonce: string;
  apiOrigin: string;
  networks: readonly string[];
  rpcUrls: Readonly<Record<string, string>>;
  /** Firebase Cloud Messaging registers devices for payment notifications. */
  push: boolean;
  development: boolean;
  secure: boolean;
}): string {
  if (!validNonce(input.nonce)) throw new Error('Invalid CSP nonce');
  const { development } = input;
  const connections = ["'self'", input.apiOrigin, ...networkOrigins(input.networks, input.rpcUrls)];
  if (input.push)
    connections.push(
      'https://firebaseinstallations.googleapis.com',
      'https://fcmregistrations.googleapis.com',
    );
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
