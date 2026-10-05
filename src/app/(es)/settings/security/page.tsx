import type { Metadata } from 'next';
import { AuthScreen } from '../../../../auth/AuthScreen';
import { clientSettings } from '../../../../lib/settings';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const { lang } = await searchParams;
  return {
    title: lang === 'en' ? 'Security — GatoPago' : 'Seguridad — GatoPago',
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang } = await searchParams;
  return (
    <AuthScreen settings={clientSettings} view="security" english={lang === 'en'} art={null} />
  );
}
