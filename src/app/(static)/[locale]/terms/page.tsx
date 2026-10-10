import { setRequestLocale } from 'next-intl/server';
import { pageLocale } from '../../../../i18n/locale';
import { staticMetadata } from '../../../../lib/metadata';
import { LegalDocument } from '../../../../marketing/LegalDocument';

export const generateMetadata = staticMetadata('terms');

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await pageLocale(params);
  setRequestLocale(locale);
  return <LegalDocument kind="terms" lang={locale} />;
}
