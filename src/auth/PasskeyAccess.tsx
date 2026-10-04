'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { BrowserAuth } from './browser';
import type { EnabledAuthConfig } from './config';
import type { LoginChallenge, RegistrationChallenge } from './passkey-client';
import {
  requestAccountRegistration,
  requestPasskeyLogin,
  requestPasskeyProof,
  type requestPasskeyRegistration,
} from '../wallet/passkeys';
import { Turnstile, type TurnstileHandle } from './Turnstile';
import { isClientUpdateError } from '@gatopago/shared/v3/client-release';
import { reloadPage } from '../pwa/reload-guard';

type Stage =
  | { kind: 'choose' }
  | { kind: 'register' }
  | {
      kind: 'proof';
      prepared: RegistrationChallenge;
      credential: Awaited<ReturnType<typeof requestPasskeyRegistration>>;
    };

function message(code: string, en: boolean, keyCreated: boolean) {
  if (code === 'cancelled')
    return keyCreated
      ? en
        ? 'Your secure access is saved. Continue to finish creating your account.'
        : 'Tu acceso seguro está guardado. Continúa para terminar de crear tu cuenta.'
      : en
        ? 'Confirmation was cancelled. You can try again.'
        : 'Se canceló la confirmación. Puedes reintentar.';
  if (code === 'already-registered')
    return en
      ? 'An access key already exists. Try signing in.'
      : 'Ya existe una llave de acceso. Prueba iniciar sesión.';
  if (['expired', 'auth/expired', 'auth/challenge-unavailable'].includes(code))
    return en
      ? 'This request expired or was already used. If registration was confirmed, sign in. Otherwise, return to your details to prepare a new request.'
      : 'La solicitud venció o ya se usó. Si el registro se confirmó, inicia sesión. Si no, vuelve a tus datos para preparar una nueva solicitud.';
  if (code === 'auth/invite-unavailable')
    return en
      ? 'This invitation is unavailable. Check the code or sign in if you already registered.'
      : 'Esta invitación no está disponible. Revisa el código o inicia sesión si ya te registraste.';
  if (code === 'auth/username-unavailable')
    return en
      ? 'That username is unavailable. Choose another one.'
      : 'Ese nombre de usuario no está disponible. Elige otro.';
  if (code === 'auth/too-many-requests')
    return en
      ? 'Too many attempts. Wait before trying again.'
      : 'Hay demasiados intentos. Espera antes de volver a intentar.';
  if (code === 'auth/human-verification-failed')
    return en
      ? 'We could not validate the security check. Select Create account to try again.'
      : 'No pudimos validar la comprobación de seguridad. Pulsa Crear cuenta para volver a intentar.';
  if (code === 'auth/security-check-unavailable')
    return en
      ? 'The security check could not finish. Check your connection and select Create account to try again.'
      : 'La comprobación de seguridad no pudo terminar. Revisa tu conexión y pulsa Crear cuenta para reintentar.';
  if (code === 'auth/service-unavailable')
    return en
      ? 'Account access is temporarily unavailable. Try again later.'
      : 'El acceso a cuentas no está disponible en este momento. Inténtalo más tarde.';
  if (code === 'auth/access-denied')
    return en
      ? 'We could not complete this request. Try again later.'
      : 'No pudimos completar esta solicitud. Inténtalo más tarde.';
  if (code === 'unsupported' || code === 'context')
    return en
      ? 'Open GatoPago directly in a browser that supports secure device access.'
      : 'Abre GatoPago directamente en un navegador que admita el acceso seguro desde tu dispositivo.';
  if (code === 'auth/unauthenticated')
    return en
      ? 'We could not sign you in. Try another access key.'
      : 'No pudimos iniciar tu sesión. Prueba otra llave de acceso.';
  return keyCreated
    ? en
      ? 'We could not finish registration. Your access key is saved. Try signing in before creating another account.'
      : 'No pudimos completar el registro. Tu llave de acceso está guardada. Prueba iniciar sesión antes de crear otra cuenta.'
    : en
      ? 'We could not complete this step. Check your connection and try again.'
      : 'No pudimos completar este paso. Revisa tu conexión y reintenta.';
}

export function PasskeyAccess({
  runtime,
  config,
  english: en,
  onSignedIn,
  onRegistered,
}: {
  runtime: BrowserAuth;
  config: EnabledAuthConfig;
  english: boolean;
  onSignedIn: () => void;
  onRegistered: () => void;
}) {
  const [initialInvite] = useState(() => {
    if (typeof window === 'undefined') return '';
    const value = new URLSearchParams(window.location.hash.slice(1)).get('invite');
    return value ?? '';
  });
  const [stage, setStage] = useState<Stage>({ kind: initialInvite ? 'register' : 'choose' });
  const [invite, setInvite] = useState(initialInvite),
    [name, setName] = useState(''),
    [username, setUsername] = useState('');
  const verification = useRef<TurnstileHandle>(null);
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState(''),
    [updateRequired, setUpdateRequired] = useState(false);
  const lifecycle = useRef<AbortController | null>(null),
    pending = useRef(false),
    heading = useRef<HTMLHeadingElement>(null);
  const registrationError = useRef<HTMLParagraphElement>(null);
  const entryButton = useRef<HTMLButtonElement>(null),
    previousStage = useRef(stage.kind);
  const keyCreated = stage.kind === 'proof';
  const registering = stage.kind !== 'choose';
  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    if (window.location.hash)
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${window.location.search}`,
      );
    return () => {
      controller.abort();
    };
  }, []);
  useEffect(() => {
    if (stage.kind === 'choose' && previousStage.current !== 'choose') entryButton.current?.focus();
    else if (stage.kind !== 'choose') heading.current?.focus();
    previousStage.current = stage.kind;
  }, [stage.kind]);
  useEffect(() => {
    if (busy) return;
    if (errorCode === 'auth/invite-unavailable') document.getElementById('signup-invite')?.focus();
    else if (errorCode === 'auth/username-unavailable')
      document.getElementById('signup-username')?.focus();
    else if (errorCode) registrationError.current?.scrollIntoView({ block: 'nearest' });
  }, [busy, errorCode]);
  function perform(operation: (signal: AbortSignal) => Promise<void>) {
    const controller = lifecycle.current;
    if (!controller || controller.signal.aborted || pending.current || updateRequired) return;
    pending.current = true;
    setBusy(true);
    setErrorCode('');
    // Invoke synchronously so WebAuthn retains the click's user activation.
    void operation(controller.signal)
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) {
          if (isClientUpdateError(failure)) setUpdateRequired(true);
          else {
            const code =
              failure &&
              typeof failure === 'object' &&
              'code' in failure &&
              typeof failure.code === 'string'
                ? failure.code
                : 'auth/unavailable';
            setErrorCode(code);
          }
        }
      })
      .finally(() => {
        pending.current = false;
        if (!controller.signal.aborted) setBusy(false);
      });
  }
  function prepareRegistration(event: FormEvent) {
    event.preventDefault();
    const checker = verification.current;
    if (!checker) return;
    perform(async (signal) => {
      const result = await requestAccountRegistration(
        async () =>
          runtime.prepareRegistration(
            { invite, name, username, turnstile_token: await checker.token(signal) },
            signal,
          ),
        (prepared, credential) => {
          if (!signal.aborted) setStage({ kind: 'proof', prepared, credential });
        },
        signal,
      );
      await runtime.completeRegistration(result.id, result.submission, signal);
      if (!signal.aborted) onRegistered();
    });
  }
  function changeStage(next: Stage) {
    setStage(next);
    setErrorCode('');
  }
  const error = errorCode ? message(errorCode, en, keyCreated) : '';
  const fieldError =
    stage.kind === 'register' &&
    ['auth/invite-unavailable', 'auth/username-unavailable'].includes(errorCode);
  if (config.mode !== 'firebase')
    return (
      <p role="status">
        {en
          ? 'Account access is not configured in this environment.'
          : 'El acceso a cuentas no está configurado en este entorno.'}
      </p>
    );
  return (
    <section
      className={`auth-panel${stage.kind === 'choose' ? ' auth-panel--access-options' : ''}`}
      aria-busy={busy}
    >
      {registering ? (
        <>
          <h2 ref={heading} tabIndex={-1}>
            {stage.kind === 'register'
              ? en
                ? 'Create account'
                : 'Crear cuenta'
              : en
                ? 'Finish creating your account'
                : 'Termina de crear tu cuenta'}
          </h2>
        </>
      ) : null}
      {error && !fieldError && stage.kind !== 'register' ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      {updateRequired ? (
        <div role="alert">
          <p>{en ? 'Update GatoPago to continue.' : 'Actualiza GatoPago para continuar.'}</p>
          <button
            type="button"
            className="auth-primary btn btn-primary btn-block"
            onClick={() => reloadPage()}
          >
            {en ? 'Reload' : 'Recargar'}
          </button>
        </div>
      ) : (
        <>
          {stage.kind === 'choose' ? (
            <>
              <button
                ref={entryButton}
                type="button"
                className="auth-primary btn btn-primary btn-block"
                disabled={busy}
                onClick={() =>
                  perform(async (signal) => {
                    let prepared!: LoginChallenge;
                    const response = await requestPasskeyLogin(async () => {
                      prepared = await runtime.prepareLogin(signal);
                      return { ...prepared, signal };
                    });
                    await runtime.completeLogin(prepared.id, response, signal);
                    if (!signal.aborted) onSignedIn();
                  })
                }
              >
                {busy ? (en ? 'Signing in…' : 'Entrando…') : en ? 'Sign in' : 'Iniciar sesión'}
              </button>
              <button
                type="button"
                className="auth-secondary btn btn-ghost btn-block"
                disabled={busy}
                onClick={() => changeStage({ kind: 'register' })}
              >
                {en ? 'Create account' : 'Crear cuenta'}
              </button>
              <p className="auth-access-note">
                {en
                  ? 'You need an invitation to create an account.'
                  : 'Necesitas una invitación para crear una cuenta.'}
              </p>
            </>
          ) : null}
          {stage.kind === 'register' ? (
            <form onSubmit={prepareRegistration}>
              <p>
                {en
                  ? 'Enter your details. Your device will help you protect your account.'
                  : 'Completa tus datos. Tu dispositivo te ayudará a proteger tu cuenta.'}
              </p>
              <label htmlFor="signup-invite">
                {en ? 'Invitation code' : 'Código de invitación'}
              </label>
              <input
                id="signup-invite"
                name="invite"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                required
                value={invite}
                disabled={busy}
                aria-invalid={errorCode === 'auth/invite-unavailable' || undefined}
                aria-describedby={
                  errorCode === 'auth/invite-unavailable' ? 'invite-error' : undefined
                }
                onChange={(e) => {
                  setInvite(e.target.value);
                  if (errorCode === 'auth/invite-unavailable') setErrorCode('');
                }}
              />
              {errorCode === 'auth/invite-unavailable' ? (
                <p id="invite-error" className="auth-error" role="alert">
                  {error}
                </p>
              ) : null}
              <label htmlFor="signup-name">{en ? 'Your name' : 'Tu nombre'}</label>
              <input
                id="signup-name"
                name="name"
                autoComplete="name"
                required
                maxLength={80}
                value={name}
                disabled={busy}
                onChange={(e) => setName(e.target.value)}
              />
              <label htmlFor="signup-username">{en ? 'Username' : 'Nombre de usuario'}</label>
              <input
                id="signup-username"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                pattern="[a-z][a-z0-9_]{2,29}"
                minLength={3}
                maxLength={30}
                value={username}
                disabled={busy}
                aria-invalid={errorCode === 'auth/username-unavailable' || undefined}
                aria-describedby={`username-help${errorCode === 'auth/username-unavailable' ? ' username-error' : ''}`}
                onChange={(e) => {
                  setUsername(e.target.value.toLowerCase());
                  if (errorCode === 'auth/username-unavailable') setErrorCode('');
                }}
              />
              <p id="username-help">
                {en
                  ? '3–30 characters: letters, numbers and underscores. Start with a letter.'
                  : '3–30 caracteres: letras, números y guion bajo. Empieza con una letra.'}
              </p>
              {errorCode === 'auth/username-unavailable' ? (
                <p id="username-error" className="auth-error" role="alert">
                  {error}
                </p>
              ) : null}
              <details>
                <summary>
                  {en ? 'How to keep access to my account' : 'Cómo conservar el acceso a mi cuenta'}
                </summary>
                <p>
                  {en
                    ? 'Keep access to your device or credential manager. If you lose every access key, GatoPago cannot restore access to your funds.'
                    : 'Conserva el acceso a tu dispositivo o gestor de contraseñas. Si pierdes todas tus llaves de acceso, GatoPago no puede recuperar tus fondos.'}
                </p>
              </details>
              <Turnstile ref={verification} siteKey={config.turnstileSiteKey!} english={en} />
              <button
                className="auth-primary btn btn-primary btn-block"
                disabled={busy}
                type="submit"
              >
                {busy
                  ? en
                    ? 'Creating your account…'
                    : 'Creando tu cuenta…'
                  : en
                    ? 'Create account'
                    : 'Crear cuenta'}
              </button>
              {error && !fieldError ? (
                <p ref={registrationError} className="auth-error" role="alert">
                  {error}
                </p>
              ) : null}
            </form>
          ) : null}
          {stage.kind === 'proof' ? (
            <>
              <p role="status">
                {busy
                  ? en
                    ? 'Follow the instructions on your device…'
                    : 'Sigue las instrucciones de tu dispositivo…'
                  : en
                    ? 'Your secure access is saved. Continue to finish.'
                    : 'Tu acceso seguro está guardado. Continúa para terminar.'}
              </p>
              {!busy ? (
                <>
                  <button
                    type="button"
                    className="auth-primary btn btn-primary btn-block"
                    disabled={busy}
                    onClick={() =>
                      perform(async (signal) => {
                        const proof = await requestPasskeyProof({
                          ...stage.prepared,
                          challenge: stage.prepared.proofChallenge,
                          key: stage.credential.key,
                          credentialId: stage.credential.registration.credential_id,
                          signal,
                        });
                        await runtime.completeRegistration(
                          stage.prepared.id,
                          { ...stage.credential.registration, proof },
                          signal,
                        );
                        if (!signal.aborted) onRegistered();
                      })
                    }
                  >
                    {en ? 'Continue' : 'Continuar'}
                  </button>
                  {['expired', 'auth/expired', 'auth/challenge-unavailable'].includes(errorCode) ? (
                    <button
                      type="button"
                      className="auth-secondary btn btn-ghost btn-block"
                      disabled={busy}
                      onClick={() => changeStage({ kind: 'register' })}
                    >
                      {en ? 'Return to my details' : 'Volver a mis datos'}
                    </button>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
          {stage.kind !== 'choose' ? (
            <button
              type="button"
              className="auth-secondary btn btn-ghost btn-block"
              disabled={busy}
              onClick={() => changeStage({ kind: 'choose' })}
            >
              {en ? 'Back' : 'Volver'}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
