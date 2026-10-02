import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicUsername } from '../../../consumer/PublicUsername';
import { environment } from '../../../lib/brand';
export const metadata: Metadata = { title: 'Perfil público — GatoPago', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export const dynamic = 'force-dynamic';
export default async function Page({ params, searchParams }: { params: Promise<{ username: string }>; searchParams: Promise<{ lang?: string }> }) {
  const [{ username }, { lang }] = await Promise.all([params, searchParams]);
  let handle: string;
  try { handle = decodeURIComponent(username); } catch { notFound(); }
  // Retain /username links as well as /@username, without asserting existence.
  if (!/^@?[a-zA-Z][a-zA-Z0-9_]{4,29}$/.test(handle)) notFound();
  return <PublicUsername key={handle} username={handle.replace(/^@/, '').toLowerCase()} environment={environment} english={lang === 'en'} />;
}
