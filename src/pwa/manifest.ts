import type { Metadata, MetadataRoute, Viewport } from 'next';

/**
 * The brand's symbol on Milk, drawn in whole-pixel blocks (the kit's avatar recipe). The head
 * keeps within Android's safe circle, so the same files serve as maskable icons.
 */
export const PWA_ICONS = {
  small: '/pwa/gatopago-192-85b6c3aa8067.png',
  large: '/pwa/gatopago-512-ab25daf8adfd.png',
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
    description: 'Dinero sin fronteras. Siempre tuyo.',
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
      { src: PWA_ICONS.small, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: PWA_ICONS.large, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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
