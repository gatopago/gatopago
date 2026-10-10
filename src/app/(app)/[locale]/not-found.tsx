import { ConsumerFrame } from '../../../consumer/ConsumerFrame';
import { MeliSprite } from '../../../marketing/MeliSprite';
import { getTranslations } from 'next-intl/server';
import { Link } from '../../../i18n/navigation';

/** In the language of the address that was not found (`/en/…`, or Spanish). */
export default async function NotFound() {
  const t = await getTranslations('NotFound');
  return (
    <ConsumerFrame presentation="public">
      <div className="auth-content flex flex-1 flex-col items-center justify-center pb-16 text-center">
        <MeliSprite variant="head-cautious" className="mb-5 w-24" loading="eager" />
        <h1 className="mb-2 font-display text-[26px] leading-tight">{t('title')}</h1>
        <p className="mb-7 max-w-[300px] text-[14px] leading-relaxed text-text-muted">
          {t('description')}
        </p>
        <Link href="/" className="btn btn-primary btn-block max-w-[320px]">
          {t('home')}
        </Link>
        <Link href="/app" className="btn-text mt-1">
          {t('account')}
        </Link>
      </div>
    </ConsumerFrame>
  );
}
