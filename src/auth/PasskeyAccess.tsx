'use client';

import { useRef, useState, type FormEvent } from 'react';
import type { ClientSettings } from '../lib/settings';
import { api } from '../wallet/api';
import { failureMessage } from '../wallet/messages';
import { findWallet, newWallet } from '../wallet/passkey';
import { forgetWallet, knownWallet, type Wallet } from '../wallet/session';
import { signIn } from '../wallet/signIn';
import { Turnstile, type TurnstileHandle } from './Turnstile';

/**
 * Sign-in and sign-up with a passkey. Signing in needs one passkey prompt on a device that has
 * used the account before, two elsewhere (find the account, then sign in).
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
  const [name, setName] = useState(''),
    [username, setUsername] = useState('');
  const [known, setKnown] = useState(() => (typeof window === 'undefined' ? null : knownWallet()));
  /** A passkey created for sign-up, kept so that retrying does not create another one. */
  const [created, setCreated] = useState<Wallet | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const verification = useRef<TurnstileHandle>(null);

  function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    action()
      .catch((failure: unknown) => setError(failureMessage(failure, en)))
      .finally(() => setBusy(false));
  }

  function enter(wallet: Wallet | null) {
    perform(async () => {
      await signIn(settings, wallet ?? (await findWallet(settings)));
      onSignedIn('/app');
    });
  }

  function register(event: FormEvent) {
    event.preventDefault();
    const checker = verification.current;
    if (!checker) return;
    perform(async () => {
      const wallet = created ?? (await newWallet(settings, username));
      setCreated(wallet);
      const turnstile = await checker.token(AbortSignal.timeout(60_000));
      const session = await signIn(settings, wallet, { invite: invite.trim(), turnstile });
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
      // The access options keep the cat and tagline beside them; the sign-up form hides them.
      className={`auth-panel${registering ? '' : ' auth-panel--access-options'}`}
      aria-busy={busy}
    >
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
            disabled={busy}
            onClick={() => enter(known)}
          >
            {busy ? (en ? 'Signing in…' : 'Entrando…') : en ? 'Sign in' : 'Iniciar sesión'}
          </button>
          {known ? (
            <button
              type="button"
              className="auth-secondary btn btn-ghost btn-block"
              disabled={busy}
              onClick={() => {
                forgetWallet();
                setKnown(null);
                enter(null);
              }}
            >
              {en ? 'Use another key' : 'Usar otra llave'}
            </button>
          ) : null}
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
          <p className="auth-access-note">
            {en
              ? 'You need an invitation to create an account.'
              : 'Necesitas una invitación para crear una cuenta.'}
          </p>
        </>
      ) : (
        <form onSubmit={register}>
          <h2>{en ? 'Create account' : 'Crear cuenta'}</h2>
          <p>
            {en
              ? 'Your device creates the key that controls your account. GatoPago never holds it.'
              : 'Tu dispositivo crea la llave que controla tu cuenta. GatoPago nunca la tiene.'}
          </p>
          <label htmlFor="signup-invite">{en ? 'Invitation code' : 'Código de invitación'}</label>
          <input
            id="signup-invite"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={invite}
            disabled={busy}
            onChange={(event) => setInvite(event.target.value)}
          />
          <label htmlFor="signup-name">{en ? 'Your name' : 'Tu nombre'}</label>
          <input
            id="signup-name"
            autoComplete="name"
            required
            maxLength={40}
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
          <label htmlFor="signup-username">{en ? 'Username' : 'Nombre de usuario'}</label>
          <input
            id="signup-username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            pattern="[a-z][a-z0-9_]{2,29}"
            maxLength={30}
            value={username}
            disabled={busy || created !== null}
            aria-describedby="username-help"
            onChange={(event) => setUsername(event.target.value.toLowerCase())}
          />
          <p id="username-help">
            {en
              ? '3–30 characters: letters, numbers and underscores. Start with a letter.'
              : '3–30 caracteres: letras, números y guion bajo. Empieza con una letra.'}
          </p>
          <details>
            <summary>
              {en ? 'How to keep access to my account' : 'Cómo conservar el acceso a mi cuenta'}
            </summary>
            <p>
              {en
                ? 'Keep your device or password manager, and add a backup key in Security. If you lose every key, nobody can restore access to your funds, not even GatoPago.'
                : 'Conserva tu dispositivo o gestor de contraseñas y agrega una llave de respaldo en Seguridad. Si pierdes todas tus llaves, nadie puede recuperar el acceso a tus fondos, ni siquiera GatoPago.'}
            </p>
          </details>
          <Turnstile ref={verification} siteKey={settings.turnstileSiteKey} english={en} />
          <button className="auth-primary btn btn-primary btn-block" disabled={busy} type="submit">
            {busy
              ? en
                ? 'Creating your account…'
                : 'Creando tu cuenta…'
              : created
                ? en
                  ? 'Finish creating my account'
                  : 'Terminar de crear mi cuenta'
                : en
                  ? 'Create account'
                  : 'Crear cuenta'}
          </button>
          <button
            type="button"
            className="auth-secondary btn btn-ghost btn-block"
            disabled={busy}
            onClick={() => {
              setRegistering(false);
              setError('');
            }}
          >
            {en ? 'Back' : 'Volver'}
          </button>
        </form>
      )}
    </section>
  );
}
