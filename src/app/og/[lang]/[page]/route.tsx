import { notFound } from 'next/navigation';
import { routing } from '../../../../i18n/routing';
import { OG_PAGES, pageImage, type OgPage } from '../../../../og/card';

/** `/og/<lang>/<page>`: the shared card of the landing, the docs and the example payment. */
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return routing.locales.flatMap((lang) => OG_PAGES.map((page) => ({ lang, page })));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lang: string; page: string }> },
) {
  const { lang, page } = await params;
  if (!(lang === 'es' || lang === 'en') || !OG_PAGES.includes(page as OgPage)) notFound();
  return pageImage(lang, page as OgPage);
}
