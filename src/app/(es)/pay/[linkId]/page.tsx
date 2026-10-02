import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicPayment } from '../../../../consumer/PublicPayment';
export const metadata: Metadata = { title: 'Pagar — GatoPago', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export const dynamic = 'force-dynamic';
export default async function Page({ params, searchParams }: { params: Promise<{ linkId: string }>; searchParams: Promise<{ lang?: string }> }) {
  const [{ linkId }, { lang }] = await Promise.all([params, searchParams]);
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(linkId)) notFound();
  return <PublicPayment key={linkId} kind="link" reference={linkId} english={lang === 'en'} />;
}
