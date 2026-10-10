import { setRequestLocale } from 'next-intl/server';
import { pageLocale } from '../../../../../i18n/locale';
import { staticMetadata } from '../../../../../lib/metadata';
import { DemoPayment } from '../../../../../marketing/DemoPayment';

export const generateMetadata = staticMetadata('demo');

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await pageLocale(params);
  setRequestLocale(locale);
  return <DemoPayment locale={locale} />;
}
