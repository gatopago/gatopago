'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { BrowserAuth } from './browser';
import type { EnabledAuthConfig } from './config';
import type { LoginChallenge, RegistrationChallenge } from './passkey-client';
import { requestPasskeyLogin, requestPasskeyProof, requestPasskeyRegistration } from '../wallet/passkeys';
import { Turnstile } from './Turnstile';
import type { ChallengeState } from './turnstile-lifecycle';
import { isClientUpdateError } from '@gatopago/shared/v3/client-release';
import { reloadPage } from '../pwa/reload-guard';

type Stage = { kind: 'choose' } | { kind: 'register' } | { kind: 'login'; prepared: LoginChallenge }
  | { kind: 'create'; prepared: RegistrationChallenge }
  | { kind: 'proof'; prepared: RegistrationChallenge; credential: Awaited<ReturnType<typeof requestPasskeyRegistration>> };

function message(code: string, en: boolean, keyCreated: boolean) {
  if (code === 'cancelled') return keyCreated
    ? en ? 'Your passkey is saved on your device, but registration is not confirmed yet. Try checking the same key again.' : 'Tu passkey está guardada en el dispositivo, pero el registro aún no está confirmado. Vuelve a comprobar esa misma llave.'
    : en ? 'Confirmation was cancelled. You can try again.' : 'Se canceló la confirmación. Puedes reintentar.';
  if (code === 'already-registered') return en ? 'This manager already has this passkey. Try signing in. A saved key alone does not confirm registration.' : 'Este gestor ya contiene esta passkey. Prueba iniciar sesión. Una llave guardada por sí sola no confirma el registro.';
  if (['expired', 'auth/expired', 'auth/challenge-unavailable'].includes(code)) return en ? 'This request expired or was already used. If registration was confirmed, sign in. Otherwise, return to your details to prepare a new request.' : 'La solicitud venció o ya se usó. Si el registro se confirmó, inicia sesión. Si no, vuelve a tus datos para preparar una nueva solicitud.';
  if (code === 'auth/invite-unavailable') return en ? 'This invitation is unavailable. Check the code or sign in if you already registered.' : 'Esta invitación no está disponible. Revisa el código o inicia sesión si ya te registraste.';
  if (code === 'auth/username-unavailable') return en ? 'That username is unavailable. Choose another one.' : 'Ese nombre de usuario no está disponible. Elige otro.';
  if (code === 'auth/too-many-requests') return en ? 'Too many attempts. Wait before trying again.' : 'Hay demasiados intentos. Espera antes de volver a intentar.';
  if (code === 'unsupported' || code === 'context') return en ? 'Open GatoPago directly in a browser and device that support passkeys.' : 'Abre GatoPago directamente en un navegador y dispositivo compatibles con passkeys.';
  if (code === 'auth/unauthenticated') return en ? 'This passkey could not sign in. Try another authorized passkey.' : 'No se pudo iniciar sesión con esta passkey. Prueba otra llave autorizada.';
  return keyCreated
    ? en ? 'We could not confirm registration. Your passkey remains saved. Try signing in with it to check the result before registering again.' : 'No pudimos confirmar el registro. Tu passkey sigue guardada. Prueba iniciar sesión con ella para comprobar el resultado antes de registrarte otra vez.'
    : en ? 'We could not complete this step. Check your connection and try again.' : 'No pudimos completar este paso. Revisa tu conexión y reintenta.';
}

export function PasskeyAccess({ runtime, config, english: en, onSignedIn, onRegistered }: {
  runtime: BrowserAuth; config: EnabledAuthConfig; english: boolean; onSignedIn: () => void; onRegistered: () => void;
}) {
  const [initialInvite] = useState(() => {
    if (typeof window === 'undefined') return '';
    const value = new URLSearchParams(window.location.hash.slice(1)).get('invite');
    return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : '';
  });
  const [stage, setStage] = useState<Stage>({ kind: initialInvite ? 'register' : 'choose' });
  const [invite, setInvite] = useState(initialInvite), [name, setName] = useState(''), [username, setUsername] = useState('');
  const [challenge, setChallenge] = useState<ChallengeState>({ status: 'loading', token: null });
  const [revision, setRevision] = useState(0), [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState(''), [updateRequired, setUpdateRequired] = useState(false);
  const lifecycle = useRef<AbortController | null>(null), pending = useRef(false), heading = useRef<HTMLHeadingElement>(null);
  const entryButton = useRef<HTMLButtonElement>(null), previousStage = useRef(stage.kind);
  const keyCreated = stage.kind === 'proof';
  const registering = ['register', 'create', 'proof'].includes(stage.kind);
  useEffect(() => {
    const controller = new AbortController(); lifecycle.current = controller;
    if (window.location.hash) window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
    return () => { controller.abort(); };
  }, []);
  useEffect(() => {
    if (stage.kind === 'choose' && previousStage.current !== 'choose') entryButton.current?.focus();
    else if (stage.kind !== 'choose') heading.current?.focus();
    previousStage.current = stage.kind;
  }, [stage.kind]);
  useEffect(() => {
    if (busy) return;
    if (errorCode === 'auth/invite-unavailable') document.getElementById('signup-invite')?.focus();
    if (errorCode === 'auth/username-unavailable') document.getElementById('signup-username')?.focus();
  }, [busy, errorCode]);
  function perform(operation: (signal: AbortSignal) => Promise<void>) {
    const controller = lifecycle.current;
    if (!controller || controller.signal.aborted || pending.current || updateRequired) return;
    pending.current = true; setBusy(true); setErrorCode('');
    // Invoke synchronously so WebAuthn retains the click's user activation.
    void operation(controller.signal).catch((failure: unknown) => {
      if (!controller.signal.aborted) {
        if (isClientUpdateError(failure)) setUpdateRequired(true);
        else {
          const code = failure && typeof failure === 'object' && 'code' in failure && typeof failure.code === 'string' ? failure.code : 'auth/unavailable';
          setErrorCode(code);
        }
      }
    }).finally(() => { pending.current = false; if (!controller.signal.aborted) setBusy(false); });
  }
  function prepareRegistration(event: FormEvent) {
    event.preventDefault();
    if (challenge.status !== 'verified') return;
    perform(async signal => {
      try {
        const prepared = await runtime.prepareRegistration({ invite: invite.trim(), name, username, turnstile_token: challenge.token }, signal);
        if (!signal.aborted) setStage({ kind: 'create', prepared });
      } finally {
        if (!signal.aborted) { setChallenge({ status: 'loading', token: null }); setRevision(value => value + 1); }
      }
    });
  }
  function changeStage(next: Stage) { setStage(next); setErrorCode(''); }
  const error = errorCode ? message(errorCode, en, keyCreated) : '';
  const fieldError = stage.kind === 'register' && ['auth/invite-unavailable', 'auth/username-unavailable'].includes(errorCode);
  if (config.mode !== 'firebase') return <p role="status">{en ? 'Account access is not configured in this environment.' : 'El acceso a cuentas no está configurado en este entorno.'}</p>;
  return <section className={`auth-panel${stage.kind === 'choose' ? ' auth-panel--access-options' : ''}`} aria-busy={busy}>
    {registering ? <>
      <h2 ref={heading} tabIndex={-1}>{stage.kind === 'register' ? (en ? 'Your account details' : 'Los datos de tu cuenta') : en ? 'Secure your account' : 'Protege tu cuenta'}</h2>
      <ol className="auth-steps" aria-label={en ? 'Account creation progress' : 'Progreso de creación de cuenta'}>
        {[en ? 'Details' : 'Datos', 'Passkey', 'Wallet'].map((label, index) => <li key={label} aria-current={(stage.kind === 'register' ? index === 0 : index === 1) ? 'step' : undefined}>{index + 1}. {label}</li>)}
      </ol>
    </> : stage.kind === 'login' ? <h2 ref={heading} tabIndex={-1}>{en ? 'Confirm sign-in' : 'Confirma el inicio de sesión'}</h2> : null}
    {error && !fieldError ? <p className="auth-error" role="alert">{error}</p> : null}
    {updateRequired ? <div role="alert"><p>{en ? 'Update GatoPago to continue.' : 'Actualiza GatoPago para continuar.'}</p>
      <button type="button" className="auth-primary btn btn-primary btn-block" onClick={() => reloadPage()}>{en ? 'Reload' : 'Recargar'}</button></div> : <>
      {stage.kind === 'choose' ? <>
        <button ref={entryButton} type="button" className="auth-primary btn btn-primary btn-block" disabled={busy} onClick={() => perform(async signal => {
          const prepared = await runtime.prepareLogin(signal); if (!signal.aborted) changeStage({ kind: 'login', prepared });
        })}>{busy ? (en ? 'Preparing sign-in…' : 'Preparando acceso…') : en ? 'Sign in' : 'Iniciar sesión'}</button>
        <button type="button" className="auth-secondary btn btn-ghost btn-block" disabled={busy} onClick={() => changeStage({ kind: 'register' })}>{en ? 'Create account' : 'Crear cuenta'}</button>
        <p className="auth-access-note">{en ? 'You need an invitation to create an account.' : 'Necesitas una invitación para crear una cuenta.'}</p>
      </> : null}
      {stage.kind === 'register' ? <form onSubmit={prepareRegistration}>
        <p>{en ? 'Enter your invitation and choose your name. Next, save and test a passkey; then we will guide you through creating your wallet.' : 'Ingresa tu invitación y elige tu nombre. Después guardarás y comprobarás una passkey; luego te guiaremos para crear tu wallet.'}</p>
        <label htmlFor="signup-invite">{en ? 'Invitation code' : 'Código de invitación'}</label>
        <input id="signup-invite" name="invite" autoComplete="off" autoCapitalize="none" spellCheck={false} required pattern="(?:[A-Za-z0-9_]|-){43}" maxLength={43} value={invite} disabled={busy}
          aria-invalid={errorCode === 'auth/invite-unavailable' || undefined} aria-describedby={errorCode === 'auth/invite-unavailable' ? 'invite-error' : undefined}
          onChange={e => { setInvite(e.target.value); if (errorCode === 'auth/invite-unavailable') setErrorCode(''); }} />
        {errorCode === 'auth/invite-unavailable' ? <p id="invite-error" className="auth-error" role="alert">{error}</p> : null}
        <label htmlFor="signup-name">{en ? 'Your name' : 'Tu nombre'}</label>
        <input id="signup-name" name="name" autoComplete="name" required maxLength={80} value={name} disabled={busy} onChange={e => setName(e.target.value)} />
        <label htmlFor="signup-username">{en ? 'Username' : 'Nombre de usuario'}</label>
        <input id="signup-username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required pattern="[a-z][a-z0-9_]{4,29}" maxLength={30} value={username} disabled={busy}
          aria-invalid={errorCode === 'auth/username-unavailable' || undefined} aria-describedby={`username-help${errorCode === 'auth/username-unavailable' ? ' username-error' : ''}`}
          onChange={e => { setUsername(e.target.value.toLowerCase()); if (errorCode === 'auth/username-unavailable') setErrorCode(''); }} />
        <p id="username-help">{en ? '5–30 characters: letters, numbers and underscores. Start with a letter.' : '5–30 caracteres: letras, números y guion bajo. Empieza con una letra.'}</p>
        {errorCode === 'auth/username-unavailable' ? <p id="username-error" className="auth-error" role="alert">{error}</p> : null}
        <p>{en ? 'Your passkey gives you access. You will authorize wallet creation in the next steps. Keep access to your key manager: if all authorized keys are lost, GatoPago cannot restore access to your funds.' : 'Tu passkey te da acceso. En los siguientes pasos autorizarás la creación de la wallet. Conserva el acceso a tu gestor: si pierdes todas las llaves autorizadas, GatoPago no puede restablecer el acceso a tus fondos.'}</p>
        <Turnstile key={revision} siteKey={config.turnstileSiteKey!} onState={setChallenge} english={en} />
        <button className="auth-primary btn btn-primary btn-block" disabled={busy || challenge.status !== 'verified'} type="submit">{busy ? (en ? 'Checking your details…' : 'Comprobando tus datos…') : en ? 'Prepare my passkey' : 'Preparar mi passkey'}</button>
        {challenge.status !== 'verified' && !busy ? <p role="status">{en ? 'Complete the security check to continue. After an attempt, a new check is required.' : 'Completa la verificación de seguridad para continuar. Después de un intento se necesita una nueva verificación.'}</p> : null}
      </form> : null}
      {stage.kind === 'login' ? <>
        <p>{en ? 'Your device will ask for the passkey you use for GatoPago.' : 'Tu dispositivo te pedirá la passkey que usas para GatoPago.'}</p>
        <button type="button" className="auth-primary btn btn-primary btn-block" disabled={busy} onClick={() => perform(async signal => {
          const response = await requestPasskeyLogin({ ...stage.prepared, signal });
          await runtime.completeLogin(stage.prepared.id, response, signal); if (!signal.aborted) onSignedIn();
        })}>{en ? 'Confirm sign-in' : 'Confirmar inicio de sesión'}</button>
      </> : null}
      {stage.kind === 'create' ? <>
        <p>{en ? `Save a passkey for @${stage.prepared.userName}. Your device will ask you to create it, then use that same key once to confirm it works.` : `Guarda una passkey para @${stage.prepared.userName}. Tu dispositivo te pedirá crearla y después usar esa misma llave una vez para comprobar que funciona.`}</p>
        <button type="button" className="auth-primary btn btn-primary btn-block" disabled={busy} onClick={() => perform(async signal => {
          const credential = await requestPasskeyRegistration({ ...stage.prepared, signal });
          if (!signal.aborted) setStage({ kind: 'proof', prepared: stage.prepared, credential });
        })}>{en ? 'Save my passkey' : 'Guardar mi passkey'}</button>
      </> : null}
      {stage.kind === 'proof' ? <>
        <p role="status">{en ? 'Passkey saved on your device. Use that same key to confirm registration, then continue to your wallet.' : 'Passkey guardada en tu dispositivo. Usa esa misma llave para confirmar el registro y continuar con tu wallet.'}</p>
        <button type="button" className="auth-primary btn btn-primary btn-block" disabled={busy} onClick={() => perform(async signal => {
          const proof = await requestPasskeyProof({ ...stage.prepared, challenge: stage.prepared.proofChallenge,
            key: stage.credential.key, credentialId: stage.credential.registration.credential_id, signal });
          await runtime.completeRegistration(stage.prepared.id, { ...stage.credential.registration, proof }, signal);
          if (!signal.aborted) onRegistered();
        })}>{en ? 'Verify my passkey and continue' : 'Comprobar mi passkey y continuar'}</button>
        {['expired', 'auth/expired', 'auth/challenge-unavailable'].includes(errorCode) ? <button type="button" className="auth-secondary btn btn-ghost btn-block" disabled={busy} onClick={() => changeStage({ kind: 'register' })}>{en ? 'Return to my details' : 'Volver a mis datos'}</button> : null}
      </> : null}
      {stage.kind !== 'choose' ? <button type="button" className="auth-secondary btn btn-ghost btn-block" disabled={busy} onClick={() => changeStage({ kind: stage.kind === 'create' ? 'register' : 'choose' })}>{stage.kind === 'create' ? (en ? 'Edit my details' : 'Editar mis datos') : en ? 'Back to sign-in options' : 'Volver a las opciones de acceso'}</button> : null}
    </>}
    {busy && stage.kind !== 'choose' && stage.kind !== 'register' ? <p role="status">{en ? 'Complete the confirmation on your device…' : 'Completa la confirmación en tu dispositivo…'}</p> : null}
  </section>;
}
