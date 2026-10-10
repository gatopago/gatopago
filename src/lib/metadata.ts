import type { Metadata } from 'next';
import type { Locale, Messages } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { brand } from './brand';
import { pwaMetadata } from '../pwa/manifest';

export async function publicMetadata(lang: Locale): Promise<Metadata> {
  const es = lang === 'es';
  const t = await getTranslations({ locale: lang, namespace: 'Metadata' });
  const title = t('home.title');
  const description = t('home.description');
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

/**
 * A page of the app (signed in, payments, public profiles): its title in the language of its
 * address, and kept out of search engines and referrers.
 */
export const privateMetadata =
  (title: keyof Messages['Titles']) =>
  async ({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> => {
    const { lang } = await searchParams;
    return {
      title: (await getTranslations({ locale: lang === 'en' ? 'en' : 'es', namespace: 'Titles' }))(
        title,
      ),
      robots: { index: false, follow: false },
      referrer: 'no-referrer',
    };
  };
