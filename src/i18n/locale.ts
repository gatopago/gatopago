import { hasLocale, type Locale } from 'next-intl';
import { notFound } from 'next/navigation';
import { routing } from './routing';

/** The language of a `[locale]` page or layout; the proxy only lets the site's languages through. */
export async function pageLocale(params: Promise<{ locale: string }>): Promise<Locale> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  return locale;
}
