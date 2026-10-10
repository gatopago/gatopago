import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { appMessages } from '../../i18n/messages';
import { Document, requestNonce } from '../Document';
export { pwaMetadata as metadata, pwaViewport as viewport } from '../../pwa/manifest';

/**
 * The app and every page that depends on the request: rendered per request, with a nonce CSP, in
 * the language of its address. Only that language's texts reach the browser.
 */
export default async function Layout({ children }: { children: ReactNode }) {
  const [nonce, locale, messages] = await Promise.all([requestNonce(), getLocale(), getMessages()]);
  return (
    <Document lang={locale} nonce={nonce}>
      <NextIntlClientProvider messages={appMessages(messages)}>{children}</NextIntlClientProvider>
    </Document>
  );
}
