import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { settings } from '../../../lib/settings';
import { DevelopersDocs } from '../../../marketing/DevelopersDocs';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: 'es', namespace: 'Metadata' });
  return {
    title: t('docs.title'),
    description: t('docs.description'),
  };
}

export default function Page() {
  setRequestLocale('es');
  return (
    <DevelopersDocs
      apiOrigin={settings.apiOrigin}
      businessOrigin={settings.businessOrigin}
      locale="es"
    />
  );
}
