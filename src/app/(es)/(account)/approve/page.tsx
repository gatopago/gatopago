import type { Metadata } from 'next';
import { AccountView } from '../../../../auth/AccountShell';

export const metadata: Metadata = {
  title: 'Entrar a Negocios · GatoPago',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang } = await searchParams;
  return <AccountView view="approve" english={lang === 'en'} />;
}
