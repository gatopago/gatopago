import { getMessages, setRequestLocale } from 'next-intl/server';
import { pageLocale } from '../../../../i18n/locale';
import { staticMetadata } from '../../../../lib/metadata';
import { CascabelPage } from '../../../../marketing/CascabelPage';
import '../../../../marketing/landing.css';

export const generateMetadata = staticMetadata('cascabel');

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await pageLocale(params);
  setRequestLocale(locale);
  const { Cascabel: copy } = await getMessages();
  return <CascabelPage lang={locale} copy={copy} />;
}
