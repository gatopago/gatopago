import type { Metadata } from 'next';
import { AccountView } from '../../../../auth/AccountShell';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const { lang } = await searchParams;
  return {
    title: lang === 'en' ? 'Your account · GatoPago' : 'Tu cuenta · GatoPago',
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang } = await searchParams;
  return <AccountView view="account" english={lang === 'en'} />;
}
