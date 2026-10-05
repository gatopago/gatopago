import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { clientSettings } from '../../../../lib/settings';
import { Checkout } from '../../../../wallet/Checkout';

export const metadata: Metadata = {
  title: 'Pagar · GatoPago',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export const dynamic = 'force-dynamic';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const [{ id }, { lang }] = await Promise.all([params, searchParams]);
  if (!/^pi_[0-9a-f]{32}$/.test(id)) notFound();
  return <Checkout key={id} id={id} settings={clientSettings} english={lang === 'en'} />;
}
