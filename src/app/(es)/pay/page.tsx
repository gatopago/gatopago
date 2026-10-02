import type { Metadata } from 'next';
import { PublicPayment } from '../../../consumer/PublicPayment';
export const metadata: Metadata = { title: 'Pagar — GatoPago', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string; lang?: string }> }) {
  const { id, lang } = await searchParams;
  return <PublicPayment key={id ?? 'missing'} kind="link" reference={id?.slice(0, 120) ?? null} english={lang === 'en'} />;
}
