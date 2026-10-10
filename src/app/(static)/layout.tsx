import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { publicMessages } from '../../i18n/messages';
import { Document } from '../Document';
export { pwaMetadata as metadata, pwaViewport as viewport } from '../../pwa/manifest';

/**
 * Spanish public pages (landing, docs, legal, the payment example): the same for everyone, so they
 * are prerendered and served from the CDN, without a nonce (see `STATIC_PAGES`).
 */
export default async function Layout({ children }: { children: ReactNode }) {
  setRequestLocale('es');
  const messages = await getMessages();
  return (
    <Document lang="es">
      <NextIntlClientProvider messages={publicMessages(messages)}>
        {children}
      </NextIntlClientProvider>
    </Document>
  );
}
