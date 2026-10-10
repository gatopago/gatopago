'use client';

import { NextIntlClientProvider } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import english from '../messages/en.json';
import spanish from '../messages/es.json';

/**
 * The texts of the pages rendered per request (the app, payments, public profiles), in the
 * language of their address: `?lang=en` is English, anything else Spanish.
 */
export function Translations({ children }: { children: ReactNode }) {
  const en = useSearchParams().get('lang') === 'en';
  return (
    <NextIntlClientProvider locale={en ? 'en' : 'es'} messages={en ? english : spanish}>
      {children}
    </NextIntlClientProvider>
  );
}
