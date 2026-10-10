import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { publicMessages } from '../../../i18n/messages';
import { Document } from '../../Document';
export { pwaMetadata as metadata, pwaViewport as viewport } from '../../../pwa/manifest';

/** English public pages: static, prerendered without a nonce (see `STATIC_PAGES`). */
export default async function Layout({ children }: { children: ReactNode }) {
  setRequestLocale('en');
  const messages = await getMessages();
  return (
    <Document lang="en">
      <NextIntlClientProvider messages={publicMessages(messages)}>
        {children}
      </NextIntlClientProvider>
    </Document>
  );
}
