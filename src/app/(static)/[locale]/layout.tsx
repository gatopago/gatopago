import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { pageLocale } from '../../../i18n/locale';
import { publicMessages } from '../../../i18n/messages';
import { routing } from '../../../i18n/routing';
import { Document } from '../../Document';
export { pwaMetadata as metadata, pwaViewport as viewport } from '../../../pwa/manifest';

/** Each public page exists in every language, and in no other. */
export const generateStaticParams = () => routing.locales.map((locale) => ({ locale }));
export const dynamicParams = false;

/**
 * Public pages (landing, docs, legal, the payment example): the same for everyone, so they are
 * prerendered and served from the CDN, without a nonce (see `STATIC_PAGES`).
 */
export default async function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const locale = await pageLocale(params);
  setRequestLocale(locale);
  const messages = await getMessages();
  return (
    <Document lang={locale}>
      <NextIntlClientProvider messages={publicMessages(messages)}>
        {children}
      </NextIntlClientProvider>
    </Document>
  );
}
