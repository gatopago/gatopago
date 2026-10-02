import type { Metadata } from 'next';
import { PublicPayment } from '../../../../consumer/PublicPayment';
export const metadata: Metadata = { title: 'Estado del pago — GatoPago', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string; userOpHash?: string; lang?: string }> }) {
  const { id, userOpHash, lang } = await searchParams;
  const reference = (id ?? userOpHash)?.slice(0, 120) ?? null;
  return <PublicPayment key={reference ?? 'missing'} kind="status" reference={reference} english={lang === 'en'} />;
}
