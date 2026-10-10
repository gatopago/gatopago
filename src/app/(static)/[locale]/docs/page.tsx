import { setRequestLocale } from 'next-intl/server';
import { pageLocale } from '../../../../i18n/locale';
import { staticMetadata } from '../../../../lib/metadata';
import { settings } from '../../../../lib/settings';
import { DevelopersDocs } from '../../../../marketing/DevelopersDocs';

export const generateMetadata = staticMetadata('docs');

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await pageLocale(params);
  setRequestLocale(locale);
  return (
    <DevelopersDocs
      apiOrigin={settings.apiOrigin}
      businessOrigin={settings.businessOrigin}
      locale={locale}
    />
  );
}
