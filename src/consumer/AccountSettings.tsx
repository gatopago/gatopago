'use client';

import { useEffect, useState } from 'react';
import { useRouter } from '../i18n/navigation';
import { useTranslations, useLocale } from 'next-intl';
import type { ClientSettings } from '../lib/settings';
import { disablePush, enablePush, pushEnabled, pushSupported } from '../wallet/push';
import { signOut, type Session } from '../wallet/session';
import { NavigationLink } from './NavigationLink';
import { BackHeader } from './Primitives';
import { SettingsSection } from './SettingsSection';
import { BellIcon } from './Icons';

const GlobeIcon = () => (
  <svg
    aria-hidden="true"
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z" />
  </svg>
);

/** `/settings`: notifications, language and sign out. Security has its own place in the menu. */
export function AccountSettings({
  settings,
  session,
}: {
  settings: ClientSettings;
  session: Session;
}) {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations('Settings');
  const [pushAvailable, setPushAvailable] = useState(false);
  const [pushOn, setPushOn] = useState(() => typeof window !== 'undefined' && pushEnabled());
  const [pushBusy, setPushBusy] = useState(false);
  const [pushProblem, setPushProblem] = useState<'blocked' | 'failed' | null>(null);
  useEffect(() => {
    void pushSupported(settings).then(setPushAvailable);
  }, [settings]);
  return (
    <>
      <BackHeader title={t('title')} />
      <div>
        {pushOn ? (
          <SettingsSection title={t('notifications')} tone="growth" icon={<BellIcon />}>
            <div className="flex items-center gap-2.5 p-5">
              <svg
                aria-hidden="true"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-growth"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <p className="text-[14px] text-text-muted">{t('notificationsOn')}</p>
            </div>
          </SettingsSection>
        ) : pushAvailable ? (
          <SettingsSection title={t('notifications')} tone="info" icon={<BellIcon />}>
            <div className="p-5">
              <p className="mb-3 text-[13px] leading-relaxed text-text-muted">
                {t('notificationsHelp')}
              </p>
              {pushProblem ? (
                <p role="alert" className="mb-3 text-[12px] leading-relaxed text-pending">
                  {t(pushProblem === 'blocked' ? 'notificationsBlocked' : 'notificationsFailed')}
                </p>
              ) : null}
              <button
                type="button"
                disabled={pushBusy}
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setPushBusy(true);
                  setPushProblem(null);
                  enablePush(settings, session, locale)
                    .catch(() => 'failed' as const)
                    .then((outcome) => {
                      setPushOn(outcome === 'on');
                      setPushProblem(
                        outcome === 'blocked' || outcome === 'failed' ? outcome : null,
                      );
                    })
                    .finally(() => setPushBusy(false));
                }}
              >
                {pushBusy ? t('turning') : t('turnOn')}
              </button>
            </div>
          </SettingsSection>
        ) : null}
        <SettingsSection title={t('language')} tone="neutral" icon={<GlobeIcon />}>
          <div className="p-5">
            <nav className="seg-track seg-track-block" aria-label={t('language')}>
              <NavigationLink
                locale="es"
                href="/settings"
                replace
                aria-current={locale === 'es' ? 'page' : undefined}
                data-active={locale === 'es'}
                className="seg-item"
              >
                Español
              </NavigationLink>
              <NavigationLink
                locale="en"
                href="/settings"
                replace
                aria-current={locale === 'en' ? 'page' : undefined}
                data-active={locale === 'en'}
                className="seg-item"
              >
                English
              </NavigationLink>
            </nav>
          </div>
        </SettingsSection>
        <button
          type="button"
          className="btn btn-ghost btn-block text-danger"
          onClick={() => {
            // Signed out here at once; this device stops getting notifications in the background.
            void disablePush(settings, session);
            signOut();
            router.replace('/login');
          }}
        >
          {t('signOut')}
        </button>
      </div>
    </>
  );
}
