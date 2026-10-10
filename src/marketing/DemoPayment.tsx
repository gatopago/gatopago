import type { Locale } from 'next-intl';
import { ConsumerFrame } from '../consumer/ConsumerFrame';
import { NavigationLink } from '../consumer/NavigationLink';
import { Panel } from '../consumer/Primitives';
import { getTranslations } from 'next-intl/server';

/** What a GatoPago payment request looks like, with example data (linked from the landing). */
export async function DemoPayment({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'Demo' });
  return (
    <ConsumerFrame presentation="public">
      <div className="auth-content">
        <p className="meli-chip mx-auto mb-4 w-fit border-pending bg-pending/10 text-pending">
          {t('example')}
        </p>
        <Panel className="meli-paper-card--strong text-center">
          <p className="mb-2 text-[13px] text-text-muted">{t('requests')}</p>
          <p className="type-mono text-[44px] font-bold leading-none">
            {t('amount')} <span className="text-[18px] text-text-muted">USDC</span>
          </p>
          <p className="mt-3 text-[14px]">{t('order')}</p>
        </Panel>
        <p className="mb-5 text-center text-[13px] leading-relaxed text-text-muted">
          {t('description')}
        </p>
        <NavigationLink href={'/login'} className="btn btn-primary btn-block">
          {t('createAccount')}
        </NavigationLink>
      </div>
    </ConsumerFrame>
  );
}
