import type { Metadata, MetadataRoute, Viewport } from 'next';

export const PWA_ICONS = {
  small: '/pwa/meli-192-91b3cbaae29a.png',
  large: '/pwa/meli-512-0d337e9a85f2.png',
} as const;

export const pwaMetadata: Metadata = {
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'GatoPago', statusBarStyle: 'default' },
  icons: { icon: '/favicon.svg', apple: PWA_ICONS.small },
};
export const pwaViewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0b0b0f' };

export function pwaManifest(staging: boolean): MetadataRoute.Manifest {
  return {
    id: '/app', start_url: '/app', scope: '/',
    name: staging ? 'GatoPago — pruebas V3' : 'GatoPago',
    short_name: staging ? 'GatoPago Test' : 'GatoPago',
    description: 'GatoPago V3. Versión de pruebas; no envíes fondos reales.',
    display: 'standalone', background_color: '#fff8f0', theme_color: '#0b0b0f',
    lang: 'es', dir: 'ltr', categories: ['finance', 'utilities'],
    prefer_related_applications: false,
    icons: [
      { src: PWA_ICONS.small, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: PWA_ICONS.large, sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
    // No shortcuts to unfinished payments or screenshots from V1/V2.
  };
}

export function pwaHeaders() {
  return [
    { source: '/sw.js', headers: [
      { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
      { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
      { key: 'Service-Worker-Allowed', value: '/' },
      { key: 'Content-Security-Policy', value: "default-src 'none'; script-src 'self'; connect-src 'self'" },
    ] },
    { source: '/manifest.webmanifest', headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }] },
  ];
}
