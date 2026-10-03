import type { NextConfig } from 'next';
import { webAuthConfig } from './src/auth/server-config';
import { authHeaders } from './src/auth/config';
import { pwaHeaders } from './src/pwa/manifest';

// Evaluate at build/start: emulated release configuration must fail early.
webAuthConfig();

const config: NextConfig = {
  agentRules: false,
  // Invitation codes belong neither in request logs nor forwarded browser logs.
  // Hosted access-log redaction is a separate release gate, not controlled here.
  logging: {
    incomingRequests: { ignore: [/^\/login(?:[?/]|$)/] },
    browserToTerminal: false,
    serverFunctions: false,
  },
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
    ] }, ...authHeaders(), ...pwaHeaders(),
    ...['/brand/:path*', '/pwa/:path*', '/favicon.svg', '/favicon.ico', '/og.png', '/Logo_gatopago.svg', '/apple-touch-icon.png'].map((source) => ({
      source, headers: [{ key: 'Content-Security-Policy', value: "default-src 'none'; base-uri 'none'; frame-ancestors 'none'" }],
    }))];
  },
};
export default config;
