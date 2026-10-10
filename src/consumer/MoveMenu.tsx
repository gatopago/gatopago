'use client';

import type { ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { MeliSprite } from '../marketing/MeliSprite';
import { BackHeader, OptionCard, TabHeader } from './Primitives';
import { useTranslations } from 'next-intl';

const icon = (children: ReactNode) => (
  <svg
    aria-hidden="true"
    width="19"
    height="19"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);
const receiveIcon = icon(
  <>
    <path d="M12 5v14" />
    <path d="m19 12-7 7-7-7" />
  </>,
);

/** `/move`, as in V2: receive, send or swap; receiving then chooses a request or the account. */
export function MoveMenu() {
  const t = useTranslations('MoveMenu');
  const receiving = useSearchParams().get('flow') === 'receive';

  if (receiving)
    return (
      <>
        <BackHeader title={t('receiveMoney')} to="/move" />
        <div className="mb-5 flex items-end gap-3">
          <p className="min-w-0 flex-1 text-[14px] leading-relaxed text-text-muted">
            {t('askSomeonePayShare')}
          </p>
          <MeliSprite variant="body-qr" className="w-20 shrink-0" motion="idle" />
        </div>
        <div className="flex flex-col gap-2.5">
          <OptionCard
            href="/charge"
            tone="brand"
            title={t('requestPayment')}
            description={t('createLinkQrAmount')}
            icon={icon(
              <>
                <path d="M12 8v8" />
                <path d="M8 12h8" />
                <rect x="3" y="4" width="18" height="16" rx="3" />
              </>,
            )}
          />
          <OptionCard
            href="/receive"
            tone="info"
            title={t('receiveMyAccount')}
            description={t('addressQrWalletExchange')}
            icon={receiveIcon}
          />
        </div>
      </>
    );

  return (
    <>
      <TabHeader
        title={t('move')}
        description={t('chooseWhatDoSee')}
        art={<MeliSprite variant="body-courier" motion="deliver" />}
      />
      <div className="flex flex-col gap-2.5">
        <OptionCard
          href="/move?flow=receive"
          tone="info"
          title={t('receive')}
          description={t('requestPaymentShareAccount')}
          icon={receiveIcon}
        />
        <OptionCard
          href="/send"
          tone="brand"
          title={t('send')}
          description={t('usernameWalletExchange')}
          icon={icon(
            <>
              <path d="M12 19V5" />
              <path d="m5 12 7-7 7 7" />
            </>,
          )}
        />
        <OptionCard
          href="/team"
          tone="brand"
          title={t('groupPayment')}
          description={t('severalPeopleOnceBalance')}
          icon={icon(
            <>
              <circle cx="9" cy="8" r="3" />
              <path d="M3 19c0-3 3-5 6-5s6 2 6 5" />
              <path d="M16 11a3 3 0 1 0 0-6" />
              <path d="M21 19c0-2-1.5-3.6-4-4.4" />
            </>,
          )}
        />
        <OptionCard
          href="/swap"
          tone="neutral"
          title={t('swap')}
          description={t('betweenUsdcOtherCoins')}
          icon={icon(
            <>
              <path d="M7 4v16" />
              <path d="m3 8 4-4 4 4" />
              <path d="M17 20V4" />
              <path d="m13 16 4 4 4-4" />
            </>,
          )}
        />
        <OptionCard
          href="/crosschain"
          tone="pending"
          title={t('betweenNetworks')}
          description={t('moveUsdcOneNetwork')}
          icon={icon(
            <>
              <path d="M7 7h11l-3-3" />
              <path d="m18 7-3 3" />
              <path d="M17 17H6l3 3" />
              <path d="m6 17 3-3" />
            </>,
          )}
        />
      </div>
    </>
  );
}
