import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { settings } from './src/lib/settings';
import { pwaHeaders } from './src/pwa/manifest';

// Read at build: a missing or invalid setting fails it.
void settings;

/** Pages that show an account are never cached. */
const privateHeaders = ['/login', '/app', '/approve', '/settings/:path*'].map((source) => ({
  source,
  headers: [
    { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
    { key: 'CDN-Cache-Control', value: 'no-store' },
    { key: 'Vercel-CDN-Cache-Control', value: 'no-store' },
    { key: 'Referrer-Policy', value: 'no-referrer' },
  ],
}));

const config: NextConfig = {
  agentRules: false,
  logging: { browserToTerminal: false, serverFunctions: false },
  poweredByHeader: false,
  // The shared-link cards (`/og/…`) read their fonts and the cat from the repo at run time.
  outputFileTracingIncludes: { '/og/**/*': ['./src/og/assets/**/*', './public/Logo_gatopago.svg'] },
  // Static pages have one path per language; links from before used `?lang=en`.
  async redirects() {
    return ['/docs', '/pay/demo-cafe-norte'].map((source) => ({
      source,
      has: [{ type: 'query' as const, key: 'lang', value: 'en' }],
      destination: `/en${source}`,
      permanent: true,
    }));
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      ...privateHeaders,
      ...pwaHeaders(),
      ...[
        '/brand/:path*',
        '/pwa/:path*',
        '/favicon.svg',
        '/favicon.ico',
        '/Logo_gatopago.svg',
        '/apple-touch-icon.png',
      ].map((source) => ({
        source,
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
          },
        ],
      })),
    ];
  },
};
// next-intl reads its request configuration from `src/i18n/request.ts`.
export default createNextIntlPlugin()(config);
