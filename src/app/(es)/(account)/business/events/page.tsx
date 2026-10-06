import type { Metadata } from 'next';
import { AccountView } from '../../../../../auth/AccountShell';

export const metadata: Metadata = {
  title: 'Negocios · GatoPago',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang } = await searchParams;
  return <AccountView view="business" english={lang === 'en'} />;
}
