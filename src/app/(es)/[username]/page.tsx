import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicUsername } from '../../../consumer/PublicUsername';
import { environment } from '../../../lib/brand';
export const metadata: Metadata = {
  title: 'Perfil público — GatoPago',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export const dynamic = 'force-dynamic';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const [{ username }, { lang }] = await Promise.all([params, searchParams]);
  if (!/^@[a-zA-Z][a-zA-Z0-9_]{2,29}$/.test(username)) notFound();
  return (
    <PublicUsername
      key={username}
      username={username.slice(1).toLowerCase()}
      environment={environment}
      english={lang === 'en'}
    />
  );
}
