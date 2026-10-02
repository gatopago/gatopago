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

function message(error: unknown, en: boolean) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
  if (code === 'cancelled') return en ? 'Cancelled. Your account has not been changed.' : 'Cancelado. Tu cuenta no se modificó.';
  if (code === 'expired' || code === 'auth/expired' || code === 'auth/challenge-unavailable') return en ? 'This request expired or was already used. Start again, or sign in if you already registered.' : 'La solicitud venció o ya se usó. Empieza de nuevo, o entra si ya te registraste.';
  if (code === 'auth/invite-unavailable') return en ? 'This invitation is unavailable. If you already registered, sign in with your passkey.' : 'Esta invitación no está disponible. Si ya te registraste, entra con tu passkey.';
  if (code === 'auth/username-unavailable') return en ? 'That username is unavailable. Choose another one.' : 'Ese username no está disponible. Elige otro.';
  if (code === 'auth/too-many-requests') return en ? 'Too many attempts. Wait before trying again.' : 'Hay demasiados intentos. Espera antes de volver a intentar.';
  if (code === 'unsupported') return en ? 'Use a browser and device that support passkeys.' : 'Usa un navegador y dispositivo compatibles con passkeys.';
  if (code === 'auth/unauthenticated') return en ? 'This passkey could not sign in. Try another authorized passkey.' : 'No se pudo entrar con esta passkey. Prueba otra passkey autorizada.';
  return en ? 'We could not confirm the result. If you finished registration, try signing in with that passkey to resume.' : 'No pudimos confirmar el resultado. Si terminaste el registro, intenta entrar con esa passkey para continuar.';
}

export function PasskeyAccess({ runtime, config, english: en, onSignedIn }: {
  runtime: BrowserAuth; config: EnabledAuthConfig; english: boolean; onSignedIn: () => void;
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
  const [error, setError] = useState(''), [updateRequired, setUpdateRequired] = useState(false);
  const lifecycle = useRef<AbortController | null>(null), pending = useRef(false);
  useEffect(() => {
    const controller = new AbortController(); lifecycle.current = controller;
    if (window.location.hash) window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
    return () => { controller.abort(); };
  }, []);
  function perform(operation: (signal: AbortSignal) => Promise<void>) {
    const controller = lifecycle.current;
    if (!controller || controller.signal.aborted || pending.current || updateRequired) return;
    pending.current = true; setBusy(true); setError('');
    // Invoke synchronously: a passkey operation must keep this click's user activation.
    void operation(controller.signal).catch((failure: unknown) => {
      if (!controller.signal.aborted) {
        if (isClientUpdateError(failure)) setUpdateRequired(true);
        else setError(message(failure, en));
      }
    }).finally(() => { pending.current = false; if (!controller.signal.aborted) setBusy(false); });
  }
  function prepareRegistration(event: FormEvent) {
    event.preventDefault();
    if (challenge.status !== 'verified') return;
    perform(async signal => {
      try {
        const prepared = await runtime.prepareRegistration({ invite: invite.trim(), name, username, turnstile_token: challenge.token }, signal);
        if (!signal.aborted) { setInvite(''); setStage({ kind: 'create', prepared }); }
      } finally {
        if (!signal.aborted) { setChallenge({ status: 'loading', token: null }); setRevision(value => value + 1); }
      }
    });
  }
  if (config.mode !== 'firebase') return <p role="status">{en ? 'Passkey access needs a configured Wallet Core environment.' : 'El acceso con passkey necesita un entorno de Wallet Core configurado.'}</p>;
  return <section className={`auth-panel${stage.kind === 'choose' ? ' auth-panel--access-options' : ''}`} aria-busy={busy}>
    {error ? <p className="auth-error" role="alert">{error}</p> : null}
    {updateRequired ? <div role="alert"><p>{en ? 'Update GatoPago to continue.' : 'Actualiza GatoPago para continuar.'}</p>
      <button type="button" className="auth-primary btn btn-primary btn-block" onClick={() => reloadPage()}>{en ? 'Reload' : 'Recargar'}</button></div> : <>
      {stage.kind === 'choose' ? <>
        <button className="auth-primary btn btn-primary btn-block" disabled={busy} onClick={() => perform(async signal => {
          const prepared = await runtime.prepareLogin(signal); if (!signal.aborted) setStage({ kind: 'login', prepared });
        })}>{en ? 'Sign in with passkey' : 'Entrar con passkey'}</button>
        <button className="auth-secondary btn btn-ghost btn-block" disabled={busy} onClick={() => setStage({ kind: 'register' })}>{en ? 'Create account with invitation' : 'Crear cuenta con invitación'}</button>
      </> : null}
      {stage.kind === 'register' ? <form onSubmit={prepareRegistration}>
        <label htmlFor="signup-invite">{en ? 'Invitation code' : 'Código de invitación'}</label>
        <input id="signup-invite" autoComplete="off" autoCapitalize="none" spellCheck={false} required pattern="(?:[A-Za-z0-9_]|-){43}" maxLength={43} value={invite} disabled={busy} onChange={e => setInvite(e.target.value)} />
        <label htmlFor="signup-name">{en ? 'Your name' : 'Tu nombre'}</label>
        <input id="signup-name" autoComplete="name" required maxLength={80} value={name} disabled={busy} onChange={e => setName(e.target.value)} />
        <label htmlFor="signup-username">Username</label>
        <input id="signup-username" autoComplete="username" autoCapitalize="none" spellCheck={false} required pattern="[a-z][a-z0-9_]{4,29}" maxLength={30} value={username} disabled={busy} onChange={e => setUsername(e.target.value.toLowerCase())} aria-describedby="username-help" />
        <p id="username-help">{en ? '5–30 characters: letters, numbers and underscores. Start with a letter.' : '5–30 caracteres: letras, números y guion bajo. Empieza con una letra.'}</p>
        <p>{en ? 'Your passkey controls your wallet. GatoPago cannot recover your funds if you lose all your keys. Add a second passkey after activation.' : 'Tu passkey controla tu wallet. GatoPago no puede recuperar tus fondos si pierdes todas tus claves. Añade una segunda passkey después de activar tu cuenta.'}</p>
        <Turnstile key={revision} siteKey={config.turnstileSiteKey!} onState={setChallenge} english={en} />
        <button className="auth-primary btn btn-primary btn-block" disabled={busy || challenge.status !== 'verified'} type="submit">{en ? 'Continue' : 'Continuar'}</button>
      </form> : null}
      {stage.kind === 'login' ? <button className="auth-primary btn btn-primary btn-block" disabled={busy} onClick={() => perform(async signal => {
        const response = await requestPasskeyLogin({ ...stage.prepared, signal });
        await runtime.completeLogin(stage.prepared.id, response, signal); if (!signal.aborted) onSignedIn();
      })}>{en ? 'Use passkey' : 'Usar passkey'}</button> : null}
      {stage.kind === 'create' ? <>
        <p>{en ? `Create the passkey for @${stage.prepared.userName}. You will then confirm it once to finish registration.` : `Crea la passkey para @${stage.prepared.userName}. Después la confirmarás una vez para terminar el registro.`}</p>
        <button className="auth-primary btn btn-primary btn-block" disabled={busy} onClick={() => perform(async signal => {
          const credential = await requestPasskeyRegistration({ ...stage.prepared, signal });
          if (!signal.aborted) setStage({ kind: 'proof', prepared: stage.prepared, credential });
        })}>{en ? 'Create passkey' : 'Crear passkey'}</button>
      </> : null}
      {stage.kind === 'proof' ? <>
        <p>{en ? 'Confirm with the passkey you just created to finish registration.' : 'Confirma con la passkey que acabas de crear para terminar el registro.'}</p>
        <button className="auth-primary btn btn-primary btn-block" disabled={busy} onClick={() => perform(async signal => {
          const proof = await requestPasskeyProof({ ...stage.prepared, challenge: stage.prepared.proofChallenge,
            key: stage.credential.key, credentialId: stage.credential.registration.credential_id, signal });
          await runtime.completeRegistration(stage.prepared.id, { ...stage.credential.registration, proof }, signal);
          if (!signal.aborted) onSignedIn();
        })}>{en ? 'Confirm passkey' : 'Confirmar passkey'}</button>
      </> : null}
      {stage.kind !== 'choose' ? <button className="auth-secondary btn btn-ghost btn-block" disabled={busy} onClick={() => { setStage({ kind: 'choose' }); setError(''); }}>{en ? 'Back to sign-in options' : 'Volver a las opciones de acceso'}</button> : null}
    </>}
    {busy ? <p role="status">{en ? 'Processing…' : 'Procesando…'}</p> : null}
  </section>;
}
