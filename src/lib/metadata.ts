import type { Metadata } from 'next';
import type { Locale, Messages } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { brand } from './brand';
import { pwaMetadata } from '../pwa/manifest';
import { formatUsdc, paymentPreview, profilePreview } from '../og/data';
import { getPathname } from '../i18n/navigation';
import { pageLocale } from '../i18n/locale';

type Params<T = object> = { params: Promise<T & { locale: string }> };

/**
 * How a link looks when it is shared (WhatsApp, Telegram, X, LinkedIn): its title, description
 * and card, drawn by `/og/…` at 1200 × 630.
 */
function sharing(
  lang: Locale,
  {
    title,
    description,
    path,
    image,
  }: { title: string; description: string; path: string; image: string },
): Metadata {
  return {
    metadataBase: new URL(brand.siteUrl),
    openGraph: {
      title,
      description,
      url: path,
      siteName: brand.name,
      locale: lang === 'es' ? 'es_BO' : 'en_US',
      type: 'website',
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export async function publicMetadata({ params }: Params): Promise<Metadata> {
  const lang = await pageLocale(params);
  const home = getPathname({ href: '/', locale: lang });
  const t = await getTranslations({ locale: lang, namespace: 'Metadata' });
  const title = t('home.title');
  const description = t('home.description');
  return {
    ...sharing(lang, { title, description, path: home, image: `/og/${lang}/home` }),
    title,
    description,
    alternates: {
      canonical: home,
      languages: { es: '/', en: '/en', 'x-default': '/' },
    },
    robots: { index: true, follow: true },
    icons: pwaMetadata.icons,
  };
}

/** The docs, the legal pages and the example payment: each with the card that fits it. */
export const staticMetadata =
  (page: 'docs' | 'privacy' | 'terms' | 'demo') =>
  async ({ params }: Params): Promise<Metadata> => {
    const lang = await pageLocale(params);
    const t = await getTranslations({ locale: lang, namespace: 'Metadata' });
    if (page === 'docs') {
      const title = t('docs.title');
      const description = t('docs.description');
      return {
        title,
        description,
        ...sharing(lang, {
          title,
          description,
          path: getPathname({ href: '/docs', locale: lang }),
          image: `/og/${lang}/developers`,
        }),
      };
    }
    const hidden = { robots: { index: false, follow: false } };
    if (page === 'demo') {
      const demo = await getTranslations({ locale: lang, namespace: 'Demo' });
      return {
        title: t('demo'),
        ...hidden,
        ...sharing(lang, {
          title: t('pay.title', { merchant: 'Café Norte', amount: formatUsdc('18.00', lang) }),
          description: t('pay.description', { concept: demo('order') }),
          path: getPathname({ href: '/pay/demo-cafe-norte', locale: lang }),
          image: `/og/${lang}/demo`,
        }),
      };
    }
    const title = t(page);
    return {
      title,
      ...hidden,
      ...sharing(lang, {
        title,
        description: t('home.description'),
        path: getPathname({ href: `/${page}`, locale: lang }),
        image: `/og/${lang}/home`,
      }),
    };
  };

/**
 * A page of the app (signed in, payments, public profiles): its title in the language of its
 * address, and kept out of search engines and referrers.
 */
export const privateMetadata =
  (title: keyof Messages['Titles']) =>
  async ({ params }: Params): Promise<Metadata> => {
    const locale = await pageLocale(params);
    return {
      title: (await getTranslations({ locale, namespace: 'Titles' }))(title),
      robots: { index: false, follow: false },
      referrer: 'no-referrer',
    };
  };

/**
 * A payment link: private like the rest of the app, but its preview says who charges and how
 * much, the same anyone with the link sees on opening it. If Flow does not answer, a generic one.
 */
export async function paymentMetadata({ params }: Params<{ id: string }>): Promise<Metadata> {
  const [{ id }, locale] = await Promise.all([params, pageLocale(params)]);
  const [base, t, payment] = await Promise.all([
    privateMetadata('pay')({ params }),
    getTranslations({ locale, namespace: 'Metadata' }),
    paymentPreview(id),
  ]);
  const amount = payment ? formatUsdc(payment.amount, locale) : '';
  return {
    ...base,
    ...sharing(locale, {
      title: !payment
        ? t('pay.fallback')
        : payment.merchant
          ? t('pay.title', { merchant: payment.merchant, amount })
          : t('pay.titleUnnamed', { amount }),
      description: payment?.concept
        ? t('pay.description', { concept: payment.concept })
        : t('pay.descriptionPlain'),
      path: getPathname({ href: `/pay/${id}`, locale }),
      image: `/og/${locale}/pay/${id}`,
    }),
  };
}

/** A public profile (`/@username`): whom to pay, with the name the person chose. */
export async function profileMetadata({ params }: Params<{ username: string }>): Promise<Metadata> {
  const [{ username: segment }, locale] = await Promise.all([params, pageLocale(params)]);
  const base = await privateMetadata('publicProfile')({ params });
  // The segment arrives percent-encoded: `/@ana` is `%40ana`.
  let username: string;
  try {
    username = decodeURIComponent(segment).replace(/^@/, '');
  } catch {
    return base;
  }
  const [t, profile] = await Promise.all([
    getTranslations({ locale, namespace: 'Metadata' }),
    profilePreview(username),
  ]);
  if (!profile) return base;
  return {
    ...base,
    ...sharing(locale, {
      title: t('profile.title', { username: profile.username }),
      description: profile.name
        ? t('profile.description', { name: profile.name })
        : t('profile.descriptionPlain'),
      path: getPathname({ href: `/@${profile.username}`, locale }),
      image: `/og/${locale}/profile/${profile.username}`,
    }),
  };
}
