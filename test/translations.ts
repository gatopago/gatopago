import { NextIntlClientProvider } from 'next-intl';
import { createElement, type ReactElement } from 'react';
import english from '../src/messages/en.json';
import spanish from '../src/messages/es.json';

/** A screen with the texts of its language, as the app's layout provides them. */
export const withTexts = (screen: ReactElement, en: boolean) =>
  createElement(NextIntlClientProvider, {
    locale: en ? 'en' : 'es',
    messages: en ? english : spanish,
    children: screen,
  });
