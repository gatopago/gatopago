import type { Metadata } from 'next';
import { brand } from './brand';
import { pwaMetadata } from '../pwa/manifest';

export function publicMetadata(lang: 'es' | 'en'): Metadata {
  const es = lang === 'es';
  const title = es
    ? 'GatoPago — Tus dólares ya saben moverse'
    : 'GatoPago — Your dollars already know how to move';
  const description = es
    ? 'Recibe, envía y paga dólares digitales desde una cuenta que solo tú controlas. Sin frases semilla y sin comisiones de red.'
    : 'Receive, send, and pay digital dollars from an account only you control. No seed phrases and no network fees.';
  return {
    metadataBase: new URL(brand.siteUrl),
    title,
    description,
    alternates: {
      canonical: es ? '/' : '/en',
      languages: { es: '/', en: '/en', 'x-default': '/' },
    },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: es ? '/' : '/en',
      siteName: 'GatoPago',
      locale: es ? 'es_BO' : 'en_US',
      type: 'website',
      images: [{ url: '/og.png', width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: ['/og.png'] },
    icons: pwaMetadata.icons,
  };
}
