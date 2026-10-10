import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing, TIME_ZONE } from './routing';

/**
 * next-intl's configuration for each request: the language of its address (`/en/…`), or the one a
 * prerendered page or `getTranslations` names. Only that language's texts are loaded.
 */
export default getRequestConfig(async ({ locale, requestLocale }) => {
  const requested = locale ?? (await requestLocale);
  const language = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale: language,
    timeZone: TIME_ZONE,
    messages: (await import(`../messages/${language}.json`)).default,
  };
});
