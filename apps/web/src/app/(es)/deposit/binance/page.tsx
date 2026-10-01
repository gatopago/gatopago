import { redirect } from 'next/navigation';
export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang } = await searchParams;
  redirect('/receive' + (lang === 'en' ? '?lang=en' : ''));
}

