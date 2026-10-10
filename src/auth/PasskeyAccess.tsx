'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useAction } from '../wallet/useAction';
import type { ClientSettings } from '../lib/settings';
import { api } from '../wallet/api';
import type { Wallet } from '../wallet/session';
import { Turnstile, type TurnstileHandle } from './Turnstile';
import { UsernameInput } from '../consumer/NormalizedInput';
import { PixelRail } from '../consumer/PixelRail';
import { StageOverlay } from '../consumer/StageOverlay';
import { MeliSprite } from '../marketing/MeliSprite';
import { useTranslations } from 'next-intl';

/**
 * Sign-in and sign-up with a passkey: one button for each. The account is owned by the key Mera
 * derives from the passkey (it needs PRF), so signing in anywhere is one prompt.
 */
export function PasskeyAccess({
  settings,
  onSignedIn,
}: {
  settings: ClientSettings;
  onSignedIn: (path: string) => void;
}) {
  const t = useTranslations('PasskeyAccess');
  const [registering, setRegistering] = useState(
    () =>
      typeof window !== 'undefined' && new URLSearchParams(location.hash.slice(1)).has('invite'),
  );
  const [invite, setInvite] = useState(() =>
    typeof window === 'undefined'
      ? ''
      : (new URLSearchParams(location.hash.slice(1)).get('invite') ?? ''),
  );
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  /** A passkey created for sign-up, kept so that retrying does not create another one. */
  const [created, setCreated] = useState<Wallet | null>(null);
  /**
   * An account Wallet Core does not know (its records were lost or reset) signs in with its usual
   * passkey and is registered again: the human check runs on its own, with nothing to tap unless
   * Turnstile asks, and sign-in finishes without another prompt.
   */
  const [verifying, setVerifying] = useState<{
    resolve(token: string): void;
    reject(reason: Error): void;
  } | null>(null);
  const { busy, error, setError, run: perform } = useAction();
  /**
   * Whether Wallet Core asks new accounts for an invitation now (`INVITE_ONLY`): `null` until it
   * answers, so the field never shows only to disappear.
   */
  const [inviteRequired, setInviteRequired] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    api<{ invite_required: boolean }>(settings.apiOrigin, 'auth/signup')
      .then(({ invite_required }) => {
        if (active) setInviteRequired(invite_required);
      })
      // Unknown: ask for one; an invitation is always accepted.
      .catch(() => {
        if (active) setInviteRequired(true);
      });
    return () => {
      active = false;
    };
  }, [settings.apiOrigin]);
  const verification = useRef<TurnstileHandle>(null);
  /**
   * The passkey and wallet code (Mera, viem, the SDK) loads after the page shows, so the screen comes
   * up sooner. The buttons that open the passkey prompt wait for it: the prompt has to open right on
   * the tap (Safari cancels one opened later). If it fails to load, a tap tries again and says why.
   */
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([import('../wallet/signIn'), import('../wallet/mera')])
      .catch(() => {})
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  /** The phone lists its passkeys: whichever account is chosen signs in. */
  function enter() {
    perform(async () => {
      const { enter: enterWithPasskey } = await import('../wallet/signIn');
      await enterWithPasskey(
        settings,
        () => new Promise((resolve, reject) => setVerifying({ resolve, reject })),
      );
      onSignedIn('/app');
    });
  }
  // Once the check is on screen, its token finishes signing in.
  useEffect(() => {
    if (!verifying) return;
    const checker = verification.current;
    if (!checker) return verifying.reject(new Error('TURNSTILE_FAILED'));
    checker
      .token(AbortSignal.timeout(60_000))
      .then(verifying.resolve, () => verifying.reject(new Error('TURNSTILE_FAILED')))
      .finally(() => setVerifying(null));
  }, [verifying]);

  function register(event: FormEvent) {
    event.preventDefault();
    const checker = verification.current;
    if (!checker) return;
    perform(async () => {
      const [{ newAccountWallet }, { signIn }] = await Promise.all([
        import('../wallet/passkey'),
        import('../wallet/signIn'),
      ]);
      const wallet = created ?? (await newAccountWallet(settings, username));
      setCreated(wallet);
      const turnstile = await checker.token(AbortSignal.timeout(60_000));
      const session = await signIn(settings, wallet, {
        invite: invite.trim() || undefined,
        turnstile,
      });
      try {
        await api(settings.apiOrigin, 'profile', {
          method: 'PUT',
          token: session.token,
          body: { username, display_name: name },
        });
        onSignedIn('/app');
      } catch {
        onSignedIn('/profile');
      }
    });
  }

  return (
    <section
      // The access options keep the cat and tagline beside them; sign-up is V2's onboarding.
      className={`auth-panel ${registering ? 'auth-panel--signup' : 'auth-panel--access-options'}`}
      aria-busy={busy}
    >
      <StageOverlay
        label={
          busy && !verifying
            ? registering
              ? t('creatingAccountConfirmDevice')
              : t('signingConfirmFingerprintFace')
            : null
        }
        spinner={false}
      />
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      {!registering ? (
        <>
          <button
            type="button"
            className="auth-primary btn btn-primary btn-block"
            disabled={busy || !ready}
            onClick={enter}
          >
            {busy ? t('signing') : t('sign')}
          </button>
          <button
            type="button"
            className="auth-secondary btn btn-ghost btn-block"
            disabled={busy}
            onClick={() => {
              setRegistering(true);
              setError('');
            }}
          >
            {t('createAccount')}
          </button>
          {verifying ? <Turnstile ref={verification} siteKey={settings.turnstileSiteKey} /> : null}
          {inviteRequired === true ? (
            <p className="auth-access-note">{t('needInvitationCreateAccount')}</p>
          ) : null}
        </>
      ) : (
        <form onSubmit={register} className="flex flex-col items-center text-center">
          <MeliSprite variant="head-focused" className="mb-4 w-24" loading="eager" />
          <div className="mb-5 w-full max-w-[300px]" aria-label={t('accountCreationProgress')}>
            <div className="grid grid-cols-3 gap-2 text-[10px] font-semibold uppercase tracking-[0.08em]">
              <span className="text-growth">{t('details')}</span>
              <span className="text-cat-300">{t('key')}</span>
              <span className="text-text-faint">{t('ready')}</span>
            </div>
            <PixelRail state="active" className="mt-1" />
          </div>
          <h2 className="mb-3 font-display text-[28px] leading-tight">
            {t('almost')}
            {name.trim() ? (
              <>
                , <span className="text-cat-300">{name.trim().split(' ')[0]}</span>
              </>
            ) : null}
          </h2>
          <p className="mb-8 max-w-[300px] text-[15px] leading-relaxed text-text-muted">
            {t('fingerprintFaceKeyNo')}
          </p>
          <div className="meli-paper-card meli-paper-card--strong flex w-full max-w-[320px] flex-col gap-3.5 p-5">
            <Reassurance>{t('moneyAlwaysYours')}</Reassurance>
            <Reassurance>
              {t('oneTouchWhenOpen', { meraSessionMinutes: settings.meraSessionMinutes })}
            </Reassurance>
            <Reassurance>{t('noNetworkFeesGatopago')}</Reassurance>
          </div>
          <div className="mt-6 flex w-full max-w-[320px] flex-col gap-4 text-left">
            <label className="block text-[12px] text-text-muted">
              <span className="mb-2 block">{t('name')}</span>
              <input
                autoComplete="name"
                required
                maxLength={40}
                value={name}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
                className="meli-field h-12 text-[15px]"
              />
            </label>
            <label className="block text-[12px] text-text-muted">
              <span className="mb-2 block">{t('username')}</span>
              <span className="flex h-12 items-center gap-1 border-2 border-text bg-surface px-3.5">
                <span className="text-[15px] text-text-faint">@</span>
                <UsernameInput
                  autoComplete="username"
                  required
                  pattern="[a-z][a-z0-9_]{2,29}"
                  maxLength={30}
                  value={username}
                  disabled={busy || created !== null}
                  aria-describedby="username-help"
                  onChange={setUsername}
                  className="min-w-0 flex-1 bg-transparent text-[15px] text-text"
                />
              </span>
              <span id="username-help" className="mt-1.5 block text-[11px] text-text-faint">
                {t('n330CharactersLetters')}
              </span>
            </label>
            {inviteRequired === true || invite ? (
              <label className="block text-[12px] text-text-muted">
                <span className="mb-2 block">{t('invitationCode')}</span>
                <span className="flex h-12 items-center gap-2 border-2 border-text bg-surface px-4">
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
                    className="shrink-0 text-text-faint"
                  >
                    <path d="M20 12v8H4v-8" />
                    <path d="M2 7h20v5H2z" />
                    <path d="M12 22V7" />
                    <path d="M12 7c-1.5 0-3-1.5-3-3a2 2 0 0 1 4 0c0 1.5-1.5 3-1 3Z" />
                  </svg>
                  <input
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    required={inviteRequired === true}
                    value={invite}
                    disabled={busy}
                    onChange={(event) => setInvite(event.target.value)}
                    placeholder={t('inviteCode')}
                    className="min-w-0 flex-1 bg-transparent text-center text-[13px] tracking-wide text-text placeholder:text-text-faint"
                  />
                </span>
              </label>
            ) : null}
            <details className="text-[12px] text-text-muted">
              <summary>{t('howKeepAccessMy')}</summary>
              <p className="leading-relaxed">{t('keepDevicePasswordManager')}</p>
            </details>
          </div>
          <div className="mt-2 flex w-full flex-col items-center gap-4">
            <Turnstile ref={verification} siteKey={settings.turnstileSiteKey} />
            <button className="btn btn-primary btn-block" disabled={busy || !ready} type="submit">
              {busy
                ? t('creatingAccount')
                : created
                  ? t('finishCreatingMyAccount')
                  : t('createMyAccount')}
            </button>
            <button
              type="button"
              className="text-[13px] text-text-faint"
              disabled={busy}
              onClick={() => {
                setRegistering(false);
                setError('');
              }}
            >
              {t('iAlreadyAccount')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function Reassurance({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-left">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-growth bg-growth/12 text-growth">
        <svg
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
      <span className="text-[14px] text-text-muted">{children}</span>
    </div>
  );
}
