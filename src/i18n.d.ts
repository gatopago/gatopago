import type english from './messages/en.json';

// The texts' keys and the two languages are checked when compiling: `t('missing')` does not build.
declare module 'next-intl' {
  interface AppConfig {
    Locale: 'es' | 'en';
    Messages: typeof english;
  }
}
