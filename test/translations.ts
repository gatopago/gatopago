import { NextIntlClientProvider, type Locale } from 'next-intl';
import { createElement, type ReactElement } from 'react';
import english from '../src/messages/en.json';
import spanish from '../src/messages/es.json';
import { TIME_ZONE } from '../src/lib/language';

/** A screen with the texts of its language, as the app's layout provides them. */
export const withTexts = (screen: ReactElement, locale: Locale = 'es') =>
  createElement(NextIntlClientProvider, {
    locale,
    timeZone: TIME_ZONE,
    messages: locale === 'en' ? english : spanish,
    children: screen,
  });
