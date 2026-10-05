'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { NavigationLink } from '../consumer/NavigationLink';
import { BackHeader, Field, Panel } from '../consumer/Primitives';
import { localizedPath } from '../consumer/routes';
import type { ClientSettings } from '../lib/settings';
import { networkName } from './account';
import { api, type Profile } from './api';
import { failureMessage } from './messages';
import type { Session } from './session';

function useProfile(settings: ClientSettings, session: Session, en: boolean) {
  const [profile, setProfile] = useState<Profile | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    api<Profile>(settings.apiOrigin, 'profile', { token: session.token, signal: controller.signal })
      .then(setProfile)
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(failureMessage(failure, en));
      });
    return () => controller.abort();
  }, [settings, session, en]);
  return { profile, setProfile, error };
}

export function Receive({
  settings,
  session,
  english: en,
}: {
  settings: ClientSettings;
  session: Session;
  english: boolean;
}) {
  const { profile } = useProfile(settings, session, en);
  const [copied, setCopied] = useState(false);
  const address = session.wallet.address;
  return (
    <>
      <BackHeader title={en ? 'Receive' : 'Recibir'} english={en} to="/move" />
      {profile?.username ? (
        <Panel>
          <p className="text-sm text-text-muted">
            {en ? 'GatoPago users can pay you at' : 'Los usuarios de GatoPago te pagan a'}
          </p>
          <p className="my-2 font-display text-2xl">@{profile.username}</p>
          <NavigationLink
            className="auth-secondary btn btn-ghost btn-block"
            href={localizedPath(`/@${profile.username}`, en)}
          >
            {en ? 'My public page' : 'Mi página pública'}
          </NavigationLink>
        </Panel>
      ) : null}
      <Panel>
        <p className="text-sm text-text-muted">{en ? 'Your address' : 'Tu dirección'}</p>
        <p className="my-3 break-all font-mono text-sm">{address}</p>
        <button
          type="button"
          className="auth-primary btn btn-primary btn-block"
          onClick={() => void navigator.clipboard?.writeText(address).then(() => setCopied(true))}
        >
          {copied ? (en ? 'Copied' : 'Copiada') : en ? 'Copy address' : 'Copiar dirección'}
        </button>
        <p className="mt-4 text-sm text-text-muted">
          {en
            ? `Receive only USDC, on ${settings.networks.map(networkName).join(', ')}. It is the same address on each of them.`
            : `Recibe solo USDC, en ${settings.networks.map(networkName).join(', ')}. Es la misma dirección en todas.`}
        </p>
      </Panel>
    </>
  );
}

export function ProfileScreen({
  settings,
  session,
  english: en,
}: {
  settings: ClientSettings;
  session: Session;
  english: boolean;
}) {
  const { profile, setProfile, error: loadError } = useProfile(settings, session, en);
  const [name, setName] = useState<string | null>(null),
    [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false);

  function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSaved(false);
    api<Profile>(settings.apiOrigin, 'profile', {
      method: 'PUT',
      token: session.token,
      body: {
        display_name: name ?? profile?.display_name ?? undefined,
        ...(profile?.username ? {} : { username }),
      },
    })
      .then((value) => {
        setProfile(value);
        setSaved(true);
      })
      .catch((failure: unknown) => setError(failureMessage(failure, en)))
      .finally(() => setBusy(false));
  }

  return (
    <>
      <BackHeader title={en ? 'My profile' : 'Mi perfil'} english={en} to="/settings" />
      {loadError || error ? (
        <p className="auth-error" role="alert">
          {loadError || error}
        </p>
      ) : null}
      {saved ? <p role="status">{en ? 'Saved.' : 'Guardado.'}</p> : null}
      {!profile ? (
        loadError ? null : (
          <p role="status">{en ? 'Loading profile…' : 'Cargando perfil…'}</p>
        )
      ) : (
        <Panel>
          <form onSubmit={save} aria-busy={busy}>
            <Field label={en ? 'Display name' : 'Nombre visible'}>
              {(id) => (
                <input
                  id={id}
                  required
                  maxLength={40}
                  autoComplete="name"
                  value={name ?? profile.display_name ?? ''}
                  disabled={busy}
                  onChange={(event) => setName(event.target.value)}
                />
              )}
            </Field>
            {profile.username ? (
              <p className="mb-4">
                @{profile.username}{' '}
                <span className="text-sm text-text-muted">
                  {en ? '(cannot be changed)' : '(no se puede cambiar)'}
                </span>
              </p>
            ) : (
              <Field label={en ? 'Username (chosen once)' : 'Nombre de usuario (se elige una vez)'}>
                {(id) => (
                  <input
                    id={id}
                    required
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    pattern="[a-z][a-z0-9_]{2,29}"
                    maxLength={30}
                    value={username}
                    disabled={busy}
                    onChange={(event) => setUsername(event.target.value.toLowerCase())}
                  />
                )}
              </Field>
            )}
            <button
              type="submit"
              className="auth-primary btn btn-primary btn-block"
              disabled={busy}
            >
              {en ? 'Save' : 'Guardar'}
            </button>
          </form>
        </Panel>
      )}
    </>
  );
}
