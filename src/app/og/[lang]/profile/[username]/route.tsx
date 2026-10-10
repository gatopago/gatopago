import { profileImage } from '../../../../../og/card';
import { profilePreview } from '../../../../../og/data';

/** `/og/<lang>/profile/<username>`: the card of a public profile (`/@username`). */
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lang: string; username: string }> },
) {
  const { lang, username } = await params;
  return profileImage(lang === 'en' ? 'en' : 'es', await profilePreview(username));
}
