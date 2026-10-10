'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { walletNetwork } from '@gatopago/shared/networks';
import { BackHeader, NoticeCard } from '../consumer/Primitives';
import { SettingsSection } from '../consumer/SettingsSection';
import { ScreenLoading } from '../consumer/Skeleton';
import type { ClientSettings } from '../lib/settings';
import { useCopy } from '../lib/useCopy';
import { networkName } from './account';
import { api, type Profile } from './api';
import { useFailureMessage } from './messages';
import type { Session } from './session';
import { useProfile } from './useProfile';
import { useTranslations } from 'next-intl';

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
}: {
  settings: ClientSettings;
  session: Session;
}) {
  const t = useTranslations('Profile');
  const { profile, error, retry } = useProfile();
  return (
    <>
      <BackHeader title={t('profile')} />
      {/* A failed read never hides the profile already known; it says so and can be retried. */}
      {error ? (
        <p className="auth-error" role="alert">
          {profile ? t('couldNotUpdateProfile') : error}{' '}
          <button
            type="button"
            onClick={retry}
            className="-my-3 inline-block py-3 font-semibold underline underline-offset-2"
          >
            {t('tryAgain')}
          </button>
        </p>
      ) : null}
      {!profile ? (
        error ? null : (
          <ScreenLoading kind="settings" bar={false} />
        )
      ) : (
        <ProfileEditor
          key={profile.username ?? ''}
          profile={profile}
          settings={settings}
          session={session}
        />
      )}
    </>
  );
}

function ProfileEditor({
  profile,
  settings,
  session,
}: {
  profile: Profile;
  settings: ClientSettings;
  session: Session;
}) {
  const messageFor = useFailureMessage();
  const t = useTranslations('Profile');
  const { setProfile } = useProfile();
  const [displayName, setDisplayName] = useState(profile.display_name ?? '');
  const [socialUrl, setSocialUrl] = useState(profile.social_url ?? '');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState<'profile' | 'username' | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null);
  const { copy, label } = useCopy();
  const link = profile.username ? `${settings.webOrigin}/@${profile.username}` : null;
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
          text: part === 'username' ? t('usernameSaved') : t('profileSaved'),
        });
      })
      .catch((failure: unknown) => setNotice({ tone: 'warning', text: messageFor(failure) }))
      .finally(() => setBusy(null));
  }

  return (
    <div>
      <div className="mb-7 flex items-center gap-4 px-1">
        <div className="flex h-16 w-16 items-center justify-center border-2 border-text bg-cat-500 font-display text-[22px] text-on-cat uppercase shadow-[5px_5px_0_var(--color-cat-700)]">
          {(profile.display_name || profile.username || 'G')[0]}
        </div>
        <div className="min-w-0">
          <p className="truncate font-display text-[21px]">
            {profile.display_name || t('profile')}
          </p>
          <p className="truncate text-[13px] text-text-muted">
            {profile.username ? `@${profile.username}` : t('noUsernameYet')}
          </p>
        </div>
      </div>
      {notice ? (
        <div role={notice.tone === 'warning' ? 'alert' : 'status'} className="mb-5">
          <NoticeCard tone={notice.tone} title={notice.text} />
        </div>
      ) : null}

      <SettingsSection title={t('howPeopleSee')} icon={<UserIcon />} tone="brand">
        <form className="p-5" onSubmit={(event) => save(event, 'profile')}>
          <Label htmlFor="profile-display-name">{t('displayName')}</Label>
          <input
            id="profile-display-name"
            type="text"
            autoComplete="name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={40}
            placeholder={t('name')}
            className="meli-field mb-3 h-12 text-[14px] placeholder:text-text-faint"
          />
          <Label htmlFor="profile-social">{t('socialLinkOptional')}</Label>
          <input
            id="profile-social"
            type="url"
            inputMode="url"
            autoComplete="off"
            value={socialUrl}
            onChange={(event) => setSocialUrl(event.target.value)}
            maxLength={120}
            placeholder={t('httpsInstagramComYourname')}
            className="meli-field mb-1.5 h-12 text-[14px] placeholder:text-text-faint"
          />
          <p className="mb-3 text-[12px] text-text-faint">{t('instagramXTelegramTiktok')}</p>
          <button
            type="submit"
            disabled={busy !== null || !profileChanged}
            className="btn btn-primary btn-sm"
          >
            {busy === 'profile' ? t('saving') : t('save')}
          </button>
        </form>
      </SettingsSection>

      <SettingsSection title={t('username')} icon={<UserIcon />} tone="info">
        <form className="p-5" onSubmit={(event) => save(event, 'username')}>
          <p className="mb-3 text-[13px] text-text-muted">
            {link ? t('shareLinkWhoeverOpens') : t('getPaidEasyShare')}
          </p>
          {link ? (
            <div className="mb-3 flex items-center gap-3 border border-border bg-surface-2 py-1 pr-1 pl-3.5">
              <span className="min-w-0 flex-1 truncate text-[14px]">
                {new URL(settings.webOrigin).host}/@{profile.username}
              </span>
              <button
                type="button"
                onClick={() => copy(link, 'link')}
                className="btn btn-primary btn-sm shrink-0"
              >
                {label(t('copy'), 'link')}
              </button>
            </div>
          ) : (
            <div className="mb-3 flex h-12 items-center gap-2 border-2 border-text bg-surface px-3.5">
              <span className="text-[14px] text-text-faint">
                {new URL(settings.webOrigin).host}/@
              </span>
              <input
                type="text"
                required
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                aria-label={t('username')}
                pattern="[a-z][a-z0-9_]{2,29}"
                maxLength={30}
                value={username}
                onChange={(event) =>
                  setUsername(event.target.value.replace(/[^a-z0-9_]/gi, '').toLowerCase())
                }
                className="min-w-0 flex-1 bg-transparent text-[14px] text-text"
              />
            </div>
          )}
          {profile.username ? (
            <p className="text-[12px] text-text-faint">{t('usernameCannotChangeSo')}</p>
          ) : (
            <>
              <p className="mb-3 text-[12px] text-text-faint">{t('chooseOnlyOnce')}</p>
              <button
                type="submit"
                disabled={busy !== null || !username}
                className="btn btn-primary btn-sm"
              >
                {busy === 'username' ? t('saving') : t('save')}
              </button>
            </>
          )}
        </form>
      </SettingsSection>

      <SettingsSection title={t('account')} icon={<WalletIcon />} tone="neutral">
        <div className="p-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-[13px] text-text-muted">{t('address')}</span>
            <span className="text-right text-[11px] text-text-faint">
              {settings.networks.map(networkName).join(' · ')}
            </span>
          </div>
          <p className="mb-4 break-all font-mono text-[12px] text-text">{session.wallet.address}</p>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => copy(session.wallet.address, 'address')}
              className="btn btn-ghost btn-sm flex-1"
            >
              {label(t('copy'), 'address')}
            </button>
            {explorer ? (
              <a
                href={`${explorer}/address/${session.wallet.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost btn-sm flex-1"
              >
                {t('seeBlockchain')}
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
