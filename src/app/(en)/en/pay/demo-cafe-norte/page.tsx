import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { DemoPayment } from '../../../../../marketing/DemoPayment';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'en', namespace: 'Metadata' });
  return {
    title: t('demo'),
    robots: { index: false, follow: false },
  };
}

export default function Page() {
  setRequestLocale('en');
  return <DemoPayment locale="en" />;
}
