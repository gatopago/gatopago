import { privateMetadata } from '../../../lib/metadata';
import { AuthScreen } from '../../../auth/AuthScreen';
import { clientSettings } from '../../../lib/settings';
import { MeliSprite } from '../../../marketing/MeliSprite';

export const generateMetadata = privateMetadata('login');
export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <AuthScreen
      settings={clientSettings}
      view="login"
      art={<MeliSprite variant="body-sitting" loading="eager" />}
    />
  );
}
