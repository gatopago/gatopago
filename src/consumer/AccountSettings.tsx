'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ClientSettings } from '../lib/settings';
import { disablePush, enablePush, pushEnabled, pushSupported } from '../wallet/push';
import { signOut, type Session } from '../wallet/session';
import { NavigationLink as Link } from './NavigationLink';
import { BackHeader } from './Primitives';
import { SettingsSection } from './SettingsSection';
import { BellIcon, SecurityIcon } from './Icons';

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

/** `/settings`, as in V2: security, notifications, language and sign out. */
export function AccountSettings({
  settings,
  session,
  english: en,
}: {
  settings: ClientSettings;
  session: Session;
  english: boolean;
}) {
  const router = useRouter();
  const suffix = en ? '?lang=en' : '';
  const [pushAvailable, setPushAvailable] = useState(false);
  const [pushOn, setPushOn] = useState(() => typeof window !== 'undefined' && pushEnabled());
  const [pushBusy, setPushBusy] = useState(false),
    [pushFailed, setPushFailed] = useState(false);
  useEffect(() => {
    void pushSupported(settings).then(setPushAvailable);
  }, [settings]);
  return (
    <>
      <BackHeader title={en ? 'Settings' : 'Ajustes'} english={en} />
      <div className="animate-fade-up">
        <SettingsSection
          title={en ? 'Security' : 'Seguridad'}
          tone="pending"
          icon={<SecurityIcon />}
        >
          <div className="p-5">
            <p className="mb-4 text-[13px] leading-relaxed text-text-muted">
              {en
                ? 'Access keys, recovery and how we protect you.'
                : 'Llaves de acceso, recuperación y cómo te protegemos.'}
            </p>
            <Link href={`/settings/security${suffix}`} className="btn btn-primary btn-block">
              {en ? 'Your security center' : 'Tu centro de seguridad'}
            </Link>
          </div>
        </SettingsSection>
        {pushOn ? (
          <SettingsSection
            title={en ? 'Notifications' : 'Notificaciones'}
            tone="growth"
            icon={<BellIcon />}
          >
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
              <p className="text-[14px] text-text-muted">
                {en ? 'Payment notifications on' : 'Avisos de pagos activados'}
              </p>
            </div>
          </SettingsSection>
        ) : pushAvailable ? (
          <SettingsSection
            title={en ? 'Notifications' : 'Notificaciones'}
            tone="info"
            icon={<BellIcon />}
          >
            <div className="p-5">
              <p className="mb-3 text-[13px] leading-relaxed text-text-muted">
                {en
                  ? 'We let you know right away when you receive a payment or a deposit.'
                  : 'Te avisamos al instante cuando recibas un pago o un depósito.'}
              </p>
              {pushFailed ? (
                <p role="alert" className="mb-3 text-[12px] leading-relaxed text-pending">
                  {en
                    ? "Notifications were not turned on. Check your browser's notification permission."
                    : 'No se activaron los avisos. Revisa el permiso de notificaciones de tu navegador.'}
                </p>
              ) : null}
              <button
                type="button"
                disabled={pushBusy}
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setPushBusy(true);
                  setPushFailed(false);
                  enablePush(settings, session, en)
                    .catch(() => false)
                    .then((on) => {
                      setPushOn(on);
                      setPushFailed(!on);
                    })
                    .finally(() => setPushBusy(false));
                }}
              >
                {pushBusy
                  ? en
                    ? 'Turning on…'
                    : 'Activando…'
                  : en
                    ? 'Turn on payment notifications'
                    : 'Activar avisos de pagos'}
              </button>
            </div>
          </SettingsSection>
        ) : null}
        <SettingsSection title={en ? 'Language' : 'Idioma'} tone="neutral" icon={<GlobeIcon />}>
          <div className="p-5">
            <p className="mb-3 text-[13px] text-text-muted">
              {en ? 'Choose the app language.' : 'Elige el idioma de la app.'}
            </p>
            <nav className="seg-track seg-track-block" aria-label={en ? 'Language' : 'Idioma'}>
              <Link
                href="/settings"
                replace
                aria-current={!en ? 'page' : undefined}
                data-active={!en}
                className="seg-item"
              >
                Español
              </Link>
              <Link
                href="/settings?lang=en"
                replace
                aria-current={en ? 'page' : undefined}
                data-active={en}
                className="seg-item"
              >
                English
              </Link>
            </nav>
          </div>
        </SettingsSection>
        <button
          type="button"
          className="btn btn-danger btn-block"
          onClick={() => {
            void disablePush(settings, session).finally(() => {
              signOut();
              router.replace(`/login${suffix}`);
            });
          }}
        >
          {en ? 'Sign out' : 'Cerrar sesión'}
        </button>
      </div>
    </>
  );
}
