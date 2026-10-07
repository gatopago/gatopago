import type { Metadata } from 'next';
import { AccountView } from '../../../../auth/AccountShell';

export const metadata: Metadata = {
  title: 'Escanear · GatoPago',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang } = await searchParams;
  return <AccountView view="scan" english={lang === 'en'} />;
}
