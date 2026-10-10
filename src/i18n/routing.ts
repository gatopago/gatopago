import { defineRouting } from 'next-intl/routing';

/**
 * Spanish at the site's own addresses (`/send`), English under `/en` (`/en/send`). An address
 * without a language follows the browser on a first visit (without a preference, as crawlers ask,
 * Spanish); a language chosen with the switch is kept for a year and wins from then on.
 */
export const routing = defineRouting({
  locales: ['es', 'en'],
  defaultLocale: 'es',
  localePrefix: 'as-needed',
  localeCookie: { maxAge: 60 * 60 * 24 * 365 },
});

/**
 * The zone of next-intl's formatters, the same on the server and in the browser. No text formats
 * dates with them today (dates use the browser's zone); GatoPago's own zone is the fallback.
 */
export const TIME_ZONE = 'America/La_Paz';
