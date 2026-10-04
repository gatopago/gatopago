import type { Metadata, MetadataRoute, Viewport } from 'next';

export const PWA_ICONS = {
  small: '/pwa/meli-192-91b3cbaae29a.png',
  large: '/pwa/meli-512-0d337e9a85f2.png',
} as const;

export const pwaMetadata: Metadata = {
  applicationName: 'GatoPago',
  title: 'GatoPago',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'GatoPago', statusBarStyle: 'default' },
  icons: {
    icon: [
      { url: '/favicon.svg?v=brand-2026-10', type: 'image/svg+xml', sizes: 'any' },
      { url: '/favicon.ico?v=brand-2026-10', sizes: '16x16 32x32 48x48', type: 'image/x-icon' },
    ],
    apple: { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
  },
};
export const pwaViewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b0b0f',
};

export function pwaManifest(): MetadataRoute.Manifest {
  return {
    id: '/app',
    start_url: '/app',
    scope: '/',
    name: 'GatoPago',
    short_name: 'GatoPago',
    description: 'GatoPago V3. Versión de pruebas; no envíes fondos reales.',
    display: 'standalone',
    background_color: '#fff8f0',
    theme_color: '#0b0b0f',
    lang: 'es',
    dir: 'ltr',
    categories: ['finance', 'utilities'],
    prefer_related_applications: false,
    icons: [
      { src: PWA_ICONS.small, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: PWA_ICONS.large, sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}

export function pwaHeaders() {
  return [
    {
      source: '/sw.js',
      headers: [
        { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        { key: 'Service-Worker-Allowed', value: '/' },
        {
          key: 'Content-Security-Policy',
          value: "default-src 'none'; script-src 'self'; connect-src 'self'",
        },
      ],
    },
    {
      source: '/manifest.webmanifest',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
    },
  ];
}
