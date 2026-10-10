import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { headers } from 'next/headers';
import { LANGUAGE_HEADER, LOCALES, TIME_ZONE } from '../lib/language';

/**
 * next-intl's configuration for each request. A prerendered page names its language
 * (`setRequestLocale`, or `locale` in `getTranslations`); a page rendered per request takes the one
 * the proxy read from `?lang`. Only that language's texts are loaded.
 */
export default getRequestConfig(async ({ locale, requestLocale }) => {
  const requested = locale ?? (await requestLocale);
  const language = hasLocale(LOCALES, requested)
    ? requested
    : (await headers()).get(LANGUAGE_HEADER) === 'en'
      ? 'en'
      : 'es';
  return {
    locale: language,
    timeZone: TIME_ZONE,
    messages: (await import(`../messages/${language}.json`)).default,
  };
});
