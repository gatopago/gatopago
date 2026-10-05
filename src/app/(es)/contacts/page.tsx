import type { Metadata } from 'next';
import { AuthScreen } from '../../../auth/AuthScreen';
import { clientSettings } from '../../../lib/settings';

export const metadata: Metadata = {
  title: 'Contactos · GatoPago',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang } = await searchParams;
  return (
    <AuthScreen settings={clientSettings} view="contacts" english={lang === 'en'} art={null} />
  );
}
