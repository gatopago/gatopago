import type { Metadata } from 'next';
import { AuthScreen } from '../../../auth/AuthScreen';
import { webAuthConfig } from '../../../auth/server-config';

export const metadata: Metadata = { title: 'Enviar dinero — GatoPago', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang } = await searchParams;
  return <AuthScreen config={webAuthConfig()} view="send" english={lang === 'en'} art={null} />;
}
