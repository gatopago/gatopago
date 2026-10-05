'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { walletNetwork } from '@gatopago/shared/networks';
import { BackHeader, NoticeCard } from '../consumer/Primitives';
import { SettingsSection } from '../consumer/SettingsSection';
import { ScreenLoading } from '../consumer/Skeleton';
import type { ClientSettings } from '../lib/settings';
import { networkName } from './account';
import { api, type Profile } from './api';
import { failureMessage } from './messages';
import type { Session } from './session';
import { useProfile } from './useProfile';

const UserIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-3.5 3.6-6 8-6s8 2.5 8 6" />
  </svg>
);

const WalletIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <path d="M3 10h18" />
  </svg>
);

/** `/profile`, as in V2: how payers see you, your username and your account address. */
export function ProfileScreen({
  settings,
  session,
  english: en,
}: {
  settings: ClientSettings;
  session: Session;
  english: boolean;
}) {
  const { profile, error } = useProfile();
  return (
    <>
      <BackHeader title={en ? 'Profile' : 'Perfil'} english={en} />
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : !profile ? (
        <ScreenLoading kind="form" english={en} />
      ) : (
        <ProfileEditor
          key={profile.username ?? ''}
          profile={profile}
          settings={settings}
          session={session}
          english={en}
        />
      )}
    </>
  );
}

function ProfileEditor({
  profile,
  settings,
  session,
  english: en,
}: {
  profile: Profile;
  settings: ClientSettings;
  session: Session;
  english: boolean;
}) {
  const { setProfile } = useProfile();
  const [displayName, setDisplayName] = useState(profile.display_name ?? '');
  const [socialUrl, setSocialUrl] = useState(profile.social_url ?? '');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState<'profile' | 'username' | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const profileChanged =
    displayName.trim() !== (profile.display_name ?? '') ||
    socialUrl.trim() !== (profile.social_url ?? '');
  const { chain } = walletNetwork(settings.homeNetwork);
  const explorer = chain.blockExplorers?.default.url;

  function save(event: FormEvent, part: 'profile' | 'username') {
    event.preventDefault();
    setBusy(part);
    setNotice(null);
    api<Profile>(settings.apiOrigin, 'profile', {
      method: 'PUT',
      token: session.token,
      body:
        part === 'username'
          ? { username }
          : {
              ...(displayName.trim() ? { display_name: displayName.trim() } : {}),
              social_url: socialUrl.trim(),
            },
    })
      .then((value) => {
        setProfile(value);
        setSocialUrl(value.social_url ?? '');
        setNotice({
          tone: 'success',
          text:
            part === 'username'
              ? en
                ? 'Username saved'
                : 'Usuario guardado'
              : en
                ? 'Profile saved'
                : 'Perfil guardado',
        });
      })
      .catch((failure: unknown) =>
        setNotice({ tone: 'warning', text: failureMessage(failure, en) }),
      )
      .finally(() => setBusy(null));
  }

  return (
    <div className="animate-fade-up">
      <div className="mb-7 flex items-center gap-4 px-1">
        <div className="flex h-16 w-16 items-center justify-center border-2 border-text bg-cat-500 font-display text-[22px] text-on-cat uppercase shadow-[5px_5px_0_var(--color-cat-700)]">
          {(profile.display_name || profile.username || 'G')[0]}
        </div>
        <div className="min-w-0">
          <p className="truncate font-display text-[21px]">
            {profile.display_name || (en ? 'Profile' : 'Perfil')}
          </p>
          <p className="truncate text-[13px] text-text-muted">
            {profile.username ? `@${profile.username}` : en ? 'No username yet' : 'Aún sin usuario'}
          </p>
        </div>
      </div>
      {notice ? (
        <div role={notice.tone === 'warning' ? 'alert' : 'status'} className="mb-5">
          <NoticeCard tone={notice.tone} title={notice.text} />
        </div>
      ) : null}

      <SettingsSection title={en ? 'Profile' : 'Perfil'} icon={<UserIcon />} tone="brand">
        <form className="p-5" onSubmit={(event) => save(event, 'profile')}>
          <p className="mb-3 text-[13px] text-text-muted">
            {en
              ? 'This is how people who pay you will see you.'
              : 'Así te verán las personas que te pagan.'}
          </p>
          <Label htmlFor="profile-display-name">
            {en ? 'Display name' : 'Nombre para mostrar'}
          </Label>
          <input
            id="profile-display-name"
            type="text"
            autoComplete="name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={40}
            placeholder={en ? 'Your name' : 'Tu nombre'}
            className="meli-field mb-3 h-12 text-[14px] placeholder:text-text-faint"
          />
          <Label htmlFor="profile-social">
            {en ? 'Social link (optional)' : 'Red social (opcional)'}
          </Label>
          <input
            id="profile-social"
            type="url"
            inputMode="url"
            autoComplete="off"
            value={socialUrl}
            onChange={(event) => setSocialUrl(event.target.value)}
            maxLength={120}
            placeholder={en ? 'https://instagram.com/yourname' : 'https://instagram.com/tunombre'}
            className="meli-field mb-1.5 h-12 text-[14px] placeholder:text-text-faint"
          />
          <p className="mb-3 text-[12px] text-text-faint">
            {en
              ? 'Instagram, X, Telegram, TikTok or Facebook. Shown on your payment page.'
              : 'Instagram, X, Telegram, TikTok o Facebook. Se muestra en tu página de pago.'}
          </p>
          <button
            type="submit"
            disabled={busy !== null || !profileChanged}
            className="btn btn-primary btn-sm"
          >
            {busy === 'profile' ? (en ? 'Saving…' : 'Guardando…') : en ? 'Save' : 'Guardar'}
          </button>
        </form>
      </SettingsSection>

      <SettingsSection title={en ? 'Your username' : 'Tu usuario'} icon={<UserIcon />} tone="info">
        <form className="p-5" onSubmit={(event) => save(event, 'username')}>
          <p className="mb-3 text-[13px] text-text-muted">
            {en
              ? 'Get paid with an easy-to-share name.'
              : 'Recibe pagos con un nombre fácil de compartir.'}
          </p>
          <div className="mb-3 flex h-12 items-center gap-2 border-2 border-text bg-surface px-3.5">
            <span className="text-[14px] text-text-faint">
              {new URL(settings.webOrigin).host}/@
            </span>
            {profile.username ? (
              <span className="min-w-0 flex-1 truncate text-[14px]">{profile.username}</span>
            ) : (
              <input
                type="text"
                required
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                aria-label={en ? 'Your username' : 'Tu usuario'}
                pattern="[a-z][a-z0-9_]{2,29}"
                maxLength={30}
                value={username}
                onChange={(event) =>
                  setUsername(event.target.value.replace(/[^a-z0-9_]/gi, '').toLowerCase())
                }
                className="min-w-0 flex-1 bg-transparent text-[14px] text-text"
              />
            )}
          </div>
          {profile.username ? (
            <p className="text-[12px] text-text-faint">
              {en
                ? 'Your username is permanent so payment links never change hands.'
                : 'Tu usuario es permanente para que tus enlaces de pago nunca cambien de dueño.'}
            </p>
          ) : (
            <>
              <p className="mb-3 text-[12px] text-text-faint">
                {en ? 'You can choose it only once.' : 'Solo puedes elegirlo una vez.'}
              </p>
              <button
                type="submit"
                disabled={busy !== null || !username}
                className="btn btn-primary btn-sm"
              >
                {busy === 'username' ? (en ? 'Saving…' : 'Guardando…') : en ? 'Save' : 'Guardar'}
              </button>
            </>
          )}
        </form>
      </SettingsSection>

      <SettingsSection
        title={en ? 'Your account' : 'Tu cuenta'}
        icon={<WalletIcon />}
        tone="neutral"
      >
        <div className="p-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-[13px] text-text-muted">{en ? 'Address' : 'Dirección'}</span>
            <span className="text-right text-[11px] text-text-faint">
              {settings.networks.map(networkName).join(' · ')}
            </span>
          </div>
          <p className="mb-4 break-all font-mono text-[12px] text-text">{session.wallet.address}</p>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() =>
                void navigator.clipboard
                  .writeText(session.wallet.address)
                  .then(() => setCopied(true))
              }
              className="btn btn-ghost btn-sm flex-1"
            >
              {copied ? (en ? 'Copied' : 'Copiada') : en ? 'Copy' : 'Copiar'}
            </button>
            {explorer ? (
              <a
                href={`${explorer}/address/${session.wallet.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost btn-sm flex-1"
              >
                {en ? 'View in explorer' : 'Ver en explorador'}
              </a>
            ) : null}
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}

const Label = ({ htmlFor, children }: { htmlFor: string; children: ReactNode }) => (
  <label htmlFor={htmlFor} className="mb-1.5 block text-[12px] text-text-faint">
    {children}
  </label>
);
