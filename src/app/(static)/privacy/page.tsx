import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LegalDocument } from '../../../marketing/LegalDocument';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'es', namespace: 'Metadata' });
  return {
    title: t('privacy'),
    robots: { index: false, follow: false },
  };
}
export default function Page() {
  setRequestLocale('es');
  return <LegalDocument kind="privacy" lang="es" />;
}
