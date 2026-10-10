'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useAction } from '../wallet/useAction';
import type { ClientSettings } from '../lib/settings';
import { api } from '../wallet/api';
import { failureMessage } from '../wallet/messages';
import { newAccountWallet } from '../wallet/passkey';
import type { Wallet } from '../wallet/session';
import { enter as enterWithPasskey, signIn } from '../wallet/signIn';
import { Turnstile, type TurnstileHandle } from './Turnstile';
import { PixelRail } from '../consumer/PixelRail';
import { StageOverlay } from '../consumer/StageOverlay';
import { MeliSprite } from '../marketing/MeliSprite';

/**
 * Sign-in and sign-up with a passkey: one button for each. The account is owned by the key Mera
 * derives from the passkey (it needs PRF), so signing in anywhere is one prompt.
 */
export function PasskeyAccess({
  settings,
  english: en,
  onSignedIn,
}: {
  settings: ClientSettings;
  english: boolean;
  onSignedIn: (path: string) => void;
}) {
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
   * passkey and is registered again: the screen asks for the human check (and the invitation
   * while sign-up needs one), then sign-in finishes without another prompt.
   */
  const [reactivating, setReactivating] = useState<{
    invite: boolean;
    resolve: (answer: { turnstile: string; invite?: string }) => void;
    reject: (reason: Error) => void;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const { busy, error, setError, run: perform } = useAction(en);
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
  // Mera loads after the page shows, so the passkey prompt opens right on the tap.
  useEffect(() => {
    void import('../wallet/mera');
  }, []);

  /** The phone lists its passkeys: whichever account is chosen signs in. */
  function enter() {
    perform(async () => {
      await enterWithPasskey(
        settings,
        (needs) => new Promise((resolve, reject) => setReactivating({ ...needs, resolve, reject })),
      );
      onSignedIn('/app');
    });
  }

  function reactivate(event: FormEvent) {
    event.preventDefault();
    const checker = verification.current;
    if (!reactivating || !checker) return;
    setChecking(true);
    checker
      .token(AbortSignal.timeout(60_000))
      .then((turnstile) => {
        reactivating.resolve({ turnstile, invite: invite.trim() || undefined });
        setReactivating(null);
      })
      .catch(() => setError(failureMessage(new Error('TURNSTILE_FAILED'), en)))
      .finally(() => setChecking(false));
  }

  function stopReactivating() {
    reactivating?.reject(new Error('CANCELLED'));
    setReactivating(null);
  }

  function register(event: FormEvent) {
    event.preventDefault();
    const checker = verification.current;
    if (!checker) return;
    perform(async () => {
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
          busy && !reactivating
            ? registering
              ? en
                ? 'Creating your account. Confirm on your device when asked.'
                : 'Creando tu cuenta. Confirma en tu dispositivo cuando se te solicite.'
              : en
                ? 'Signing in. Confirm with your fingerprint or face.'
                : 'Entrando. Confirma con tu huella o tu rostro.'
            : null
        }
        spinner={false}
      />
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      {reactivating ? (
        <form onSubmit={reactivate} className="flex flex-col items-center gap-4 text-center">
          <p className="max-w-[300px] text-[15px] leading-relaxed">
            {failureMessage(new Error('TURNSTILE_REQUIRED'), en)}
          </p>
          {reactivating.invite ? (
            <label className="block w-full max-w-[320px] text-left text-[12px] text-text-muted">
              <span className="mb-2 block">{en ? 'Invitation code' : 'Código de invitación'}</span>
              <input
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={invite}
                disabled={checking}
                onChange={(event) => setInvite(event.target.value)}
                className="meli-field h-12 text-center text-[14px]"
              />
            </label>
          ) : null}
          <Turnstile ref={verification} siteKey={settings.turnstileSiteKey} english={en} />
          <button
            className="auth-primary btn btn-primary btn-block"
            disabled={checking}
            type="submit"
          >
            {checking ? (en ? 'Checking…' : 'Verificando…') : en ? 'Continue' : 'Continuar'}
          </button>
          <button
            type="button"
            className="btn-text min-h-11 text-[13px]"
            disabled={checking}
            onClick={stopReactivating}
          >
            {en ? 'Cancel' : 'Cancelar'}
          </button>
        </form>
      ) : !registering ? (
        <>
          <button
            type="button"
            className="auth-primary btn btn-primary btn-block"
            disabled={busy}
            onClick={enter}
          >
            {busy ? (en ? 'Signing in…' : 'Entrando…') : en ? 'Sign in' : 'Iniciar sesión'}
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
            {en ? 'Create account' : 'Crear cuenta'}
          </button>
          {inviteRequired === true ? (
            <p className="auth-access-note">
              {en
                ? 'You need an invitation to create an account.'
                : 'Necesitas una invitación para crear una cuenta.'}
            </p>
          ) : null}
        </>
      ) : (
        <form onSubmit={register} className="flex flex-col items-center text-center">
          <MeliSprite variant="head-focused" className="mb-4 w-24" loading="eager" />
          <div
            className="mb-5 w-full max-w-[300px]"
            aria-label={en ? 'Account creation progress' : 'Progreso de creación de cuenta'}
          >
            <div className="grid grid-cols-3 gap-2 text-[10px] font-semibold uppercase tracking-[0.08em]">
              <span className="text-growth">{en ? 'Details' : 'Datos'}</span>
              <span className="text-cat-300">{en ? 'Your key' : 'Tu llave'}</span>
              <span className="text-text-faint">{en ? 'Ready' : 'Listo'}</span>
            </div>
            <PixelRail state="active" className="mt-1" />
          </div>
          <h2 className="mb-3 font-display text-[28px] leading-tight">
            {en ? 'Almost there' : 'Casi listo'}
            {name.trim() ? (
              <>
                , <span className="text-cat-300">{name.trim().split(' ')[0]}</span>
              </>
            ) : null}
          </h2>
          <p className="mb-8 max-w-[300px] text-[15px] leading-relaxed text-text-muted">
            {en
              ? 'Your fingerprint or face will be your key: no passwords and no strange phrases.'
              : 'Tu huella o tu rostro serán tu llave: sin contraseñas ni frases raras.'}
          </p>
          <div className="meli-paper-card meli-paper-card--strong flex w-full max-w-[320px] flex-col gap-3.5 p-5">
            <Reassurance>
              {en ? 'Your money is always yours' : 'Tu dinero siempre es tuyo'}
            </Reassurance>
            <Reassurance>
              {en
                ? `One touch when you open the app, and for ${settings.meraSessionMinutes} minutes you pay without confirming each time`
                : `Un toque al abrir la app y, durante ${settings.meraSessionMinutes} minutos, pagas sin confirmar cada vez`}
            </Reassurance>
            <Reassurance>
              {en
                ? 'No network fees: GatoPago pays them'
                : 'Sin comisiones de red: las paga GatoPago'}
            </Reassurance>
          </div>
          <div className="mt-6 flex w-full max-w-[320px] flex-col gap-4 text-left">
            <label className="block text-[12px] text-text-muted">
              <span className="mb-2 block">{en ? 'Your name' : 'Tu nombre'}</span>
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
              <span className="mb-2 block">{en ? 'Your username' : 'Tu usuario'}</span>
              <span className="flex h-12 items-center gap-1 border-2 border-text bg-surface px-3.5">
                <span className="text-[15px] text-text-faint">@</span>
                <input
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  pattern="[a-z][a-z0-9_]{2,29}"
                  maxLength={30}
                  value={username}
                  disabled={busy || created !== null}
                  aria-describedby="username-help"
                  onChange={(event) =>
                    setUsername(event.target.value.replace(/[^a-z0-9_]/gi, '').toLowerCase())
                  }
                  className="min-w-0 flex-1 bg-transparent text-[15px] text-text"
                />
              </span>
              <span id="username-help" className="mt-1.5 block text-[11px] text-text-faint">
                {en
                  ? '3–30 characters: letters, numbers and underscores. Start with a letter.'
                  : '3–30 caracteres: letras, números y guion bajo. Empieza con una letra.'}
              </span>
            </label>
            {inviteRequired === true || invite ? (
              <label className="block text-[12px] text-text-muted">
                <span className="mb-2 block">
                  {en ? 'Invitation code' : 'Código de invitación'}
                </span>
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
                    placeholder={en ? 'Invite code' : 'Código de invitación'}
                    className="min-w-0 flex-1 bg-transparent text-center text-[13px] tracking-wide text-text placeholder:text-text-faint"
                  />
                </span>
              </label>
            ) : null}
            <details className="text-[12px] text-text-muted">
              <summary>
                {en ? 'How to keep access to my account' : 'Cómo conservar el acceso a mi cuenta'}
              </summary>
              <p className="leading-relaxed">
                {en
                  ? 'Keep your device or password manager, and add a backup key in Security. If you lose every key, nobody can restore access to your funds, not even GatoPago.'
                  : 'Conserva tu dispositivo o gestor de contraseñas y agrega una llave de respaldo en Seguridad. Si pierdes todas tus llaves, nadie puede recuperar el acceso a tus fondos, ni siquiera GatoPago.'}
              </p>
            </details>
          </div>
          <div className="mt-2 flex w-full flex-col items-center gap-4">
            <Turnstile ref={verification} siteKey={settings.turnstileSiteKey} english={en} />
            <button className="btn btn-primary btn-block" disabled={busy} type="submit">
              {busy
                ? en
                  ? 'Creating your account…'
                  : 'Creando tu cuenta…'
                : created
                  ? en
                    ? 'Finish creating my account'
                    : 'Terminar de crear mi cuenta'
                  : en
                    ? 'Create my account'
                    : 'Crear mi cuenta'}
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
              {en ? 'I already have an account' : 'Ya tengo una cuenta'}
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
