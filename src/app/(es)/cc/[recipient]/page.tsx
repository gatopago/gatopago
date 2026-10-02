import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicPayment } from '../../../../consumer/PublicPayment';
export const metadata: Metadata = { title: 'Recibir — GatoPago', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export const dynamic = 'force-dynamic';
export default async function Page({ params, searchParams }: { params: Promise<{ recipient: string }>; searchParams: Promise<{ lang?: string }> }) {
  const [{ recipient }, { lang }] = await Promise.all([params, searchParams]);
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(recipient)) notFound();
  return <PublicPayment key={recipient} kind="crosschain" reference={recipient} english={lang === 'en'} />;
}
