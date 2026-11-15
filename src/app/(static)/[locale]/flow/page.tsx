import { getMessages, setRequestLocale } from 'next-intl/server';
import { pageLocale } from '../../../../i18n/locale';
import { staticMetadata } from '../../../../lib/metadata';
import { FlowPage } from '../../../../marketing/FlowPage';
import '../../../../marketing/landing.css';
import '../../../../marketing/flow.css';

export const generateMetadata = staticMetadata('flow');

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await pageLocale(params);
  setRequestLocale(locale);
  const { Flow: copy } = await getMessages();
  return <FlowPage lang={locale} copy={copy} />;
}
