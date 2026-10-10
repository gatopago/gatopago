import { paymentImage } from '../../../../../og/card';
import { paymentPreview } from '../../../../../og/data';

/** `/og/<lang>/pay/<id>`: the card of a payment link, read from Flow when a chat asks for it. */
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lang: string; id: string }> },
) {
  const { lang, id } = await params;
  return paymentImage(lang === 'en' ? 'en' : 'es', await paymentPreview(id));
}
