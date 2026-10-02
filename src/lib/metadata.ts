import type { Metadata } from 'next';
import { brand, environment } from './brand';
import { pwaMetadata } from '../pwa/manifest';

export function publicMetadata(lang: 'es' | 'en'): Metadata {
  const es = lang === 'es';
  const title = es ? 'GatoPago — Tus dólares ya saben moverse' : 'GatoPago — Your dollars already know how to move';
  const description = es
    ? 'Una cuenta de dólares digitales que tú controlas. V3 está en desarrollo y pruebas: no envíes fondos reales.'
    : 'A digital-dollar account you control. V3 is in development and testing: do not send real funds.';
  const index = environment.environment === 'production' && environment.status === 'provisioned';
  return {
    metadataBase: new URL(brand.siteUrl), title, description,
    alternates: { canonical: es ? '/' : '/en', languages: { es: '/', en: '/en', 'x-default': '/' } },
    robots: { index, follow: index },
    openGraph: { title, description, url: es ? '/' : '/en', siteName: 'GatoPago', locale: es ? 'es_BO' : 'en_US', type: 'website', images: [{ url: '/og.png', width: 1200, height: 630, alt: title }] },
    twitter: { card: 'summary_large_image', title, description, images: ['/og.png'] },
    icons: pwaMetadata.icons,
  };
}
