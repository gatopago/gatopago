'use client';

import { useEffect, useState } from 'react';
import type { ClientSettings } from '../lib/settings';
import { useCopy } from '../lib/useCopy';
import { networkName } from '../wallet/account';
import { api, type Recipient } from '../wallet/api';
import { useFailureMessage } from '../wallet/messages';
import { ConsumerFrame } from './ConsumerFrame';
import { NavigationLink } from './NavigationLink';
import { Panel } from './Primitives';
import { localizedPath } from './routes';
import { CatGlyph } from '../marketing/CatGlyph';
import { ScreenLoading } from './Skeleton';
import { useTranslations, useLocale } from 'next-intl';

/** `/@username`: who receives payments to this username, and where. */
export function PublicUsername({
  username,
  settings,
}: {
  username: string;
  settings: ClientSettings;
}) {
  const messageFor = useFailureMessage();
  const locale = useLocale();
  const t = useTranslations('PublicUsername');
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [error, setError] = useState('');
  const { copy, label, failed } = useCopy();
  useEffect(() => {
    const controller = new AbortController();
    api<Recipient>(settings.apiOrigin, `recipients/${username}`, { signal: controller.signal })
      .then(setRecipient)
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(messageFor(failure));
      });
    return () => controller.abort();
  }, [settings, username, messageFor]);
  return (
    <ConsumerFrame presentation="public">
      <div className="auth-content">
        {error ? <p role="alert">{error}</p> : null}
        {!recipient && !error ? <ScreenLoading kind="detail" bar={false} /> : null}
        {recipient ? (
          <>
            <div className="flex flex-col items-center py-6 text-center">
              <div
                className="mb-5 grid h-20 w-20 place-items-center border-2 border-text bg-cat-500 font-display text-[32px] uppercase text-on-cat shadow-[6px_6px_0_var(--color-cat-700)]"
                aria-hidden="true"
              >
                {(recipient.display_name || recipient.username)[0]}
              </div>
              <h1 className="mb-1 font-display text-[28px]">
                {recipient.display_name || `@${recipient.username}`}
              </h1>
              {recipient.display_name ? (
                <p className="mb-3 text-[15px] text-text-muted">@{recipient.username}</p>
              ) : null}
              <p className="text-[14px] text-text-muted">{t('receivesPaymentsGatopago')}</p>
              {recipient.social_url ? (
                <a
                  href={recipient.social_url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="mt-3 break-all px-6 text-[13px] text-info underline underline-offset-2"
                >
                  {recipient.social_url.replace(/^https:\/\//, '')}
                </a>
              ) : null}
            </div>
            <Panel className="meli-paper-card--strong">
              <p className="mb-2 text-[12px] text-text-faint">{t('receivingAddress')}</p>
              <p className="mb-4 break-all font-mono text-[12px]">{recipient.address}</p>
              <button
                type="button"
                className="auth-secondary btn btn-ghost btn-block"
                onClick={() => copy(recipient.address)}
              >
                {label(t('copyAddress'))}
              </button>
              {failed() ? (
                <p role="alert" className="mt-3 text-[12px] text-danger">
                  {t('selectAddressAboveCopy')}
                </p>
              ) : null}
              <p className="mt-4 text-[12px] leading-relaxed text-text-muted">
                {t('sendOnlyUsdc', { value: settings.networks.map(networkName).join(', ') })}
              </p>
            </Panel>
            <NavigationLink
              className="auth-primary btn btn-primary btn-block"
              href={localizedPath(`/send?username=${recipient.username}`, locale)}
            >
              {t('payGatopago')}
            </NavigationLink>
            <p className="mt-5 flex items-center justify-center gap-2 text-[12px] text-text-muted">
              <CatGlyph className="w-6" decorative />
              {t('passkeyAuthorizesEachPayment')}
            </p>
          </>
        ) : null}
      </div>
    </ConsumerFrame>
  );
}
