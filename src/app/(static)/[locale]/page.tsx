import { getMessages, setRequestLocale } from 'next-intl/server';
import { pageLocale } from '../../../i18n/locale';
import { Landing } from '../../../marketing/Landing';
import { publicMetadata } from '../../../lib/metadata';
import '../../../marketing/landing.css';

export const generateMetadata = publicMetadata;

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await pageLocale(params);
  setRequestLocale(locale);
  const { Landing: copy } = await getMessages();
  return <Landing lang={locale} copy={copy} />;
}
