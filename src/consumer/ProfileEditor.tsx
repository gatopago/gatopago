'use client';

import { NavigationLink } from './NavigationLink';

import { useEffect, useRef, useState } from 'react';
import type { BrowserAuth } from '../auth/browser';
import type { WalletPage } from '../wallet/core';
import type { AccountPage } from '../wallet/balances';
import { profileMessage, type Profile } from '../wallet/profile';
import { creationFeeUnit } from '../wallet/creation-fee';
import { reloadPage } from '../pwa/reload-guard';
import { Field, Panel } from './Primitives';
import { localizedPath } from './routes';

export function ProfileEditor({
  runtime,
  uid,
  english: en,
}: {
  runtime: BrowserAuth;
  uid: string;
  english: boolean;
}) {
  const [profile, setProfile] = useState<Profile | null>(null),
    [name, setName] = useState(''),
    [username, setUsername] = useState('');
  const [wallets, setWallets] = useState<WalletPage>({ data: [], next_cursor: null }),
    [wallet, setWallet] = useState('');
  const [accounts, setAccounts] = useState<AccountPage>({ data: [], next_cursor: null }),
    [account, setAccount] = useState('');
  const [busy, setBusy] = useState(true),
    [closed, setClosed] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false);
  const session = useRef<ReturnType<BrowserAuth['profile']> | null>(null),
    lifecycle = useRef<AbortController | null>(null),
    pending = useRef(false);
  function apply(value: Profile) {
    setProfile(value);
    setName(value.display_name);
    setUsername(value.username ?? '');
  }
  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    pending.current = true;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      const captured = runtime.profile(uid);
      session.current = captured;
      unsubscribe = runtime.subscribe((identity) => {
        try {
          if (identity?.uid !== uid) throw new Error('Changed');
          captured.assertCurrent();
        } catch {
          controller.abort();
          setClosed(true);
        }
      });
      const [value, page] = await Promise.all([
        captured.read(controller.signal),
        runtime.wallets(uid, controller.signal),
      ]);
      const candidates = page.data.filter((item) => item.status === 'active');
      let singleWallet: string | null = null,
        singleAccounts: AccountPage | null = null;
      if (
        value.username_published_at === null &&
        page.next_cursor === null &&
        candidates.length === 1
      ) {
        singleWallet = candidates[0].id;
        try {
          singleAccounts = await runtime
            .balances(uid)
            .accounts(singleWallet, null, controller.signal);
        } catch (failure) {
          if (!controller.signal.aborted) setError(profileMessage(failure, en));
        }
      }
      captured.assertCurrent();
      if (!controller.signal.aborted) {
        apply(value);
        setWallets(page);
        if (singleWallet) {
          setWallet(singleWallet);
          setAccounts(singleAccounts ?? { data: [], next_cursor: null });
          setAccount(
            singleAccounts?.next_cursor === null && singleAccounts.data.length === 1
              ? singleAccounts.data[0].id
              : '',
          );
        }
      }
    })()
      .catch((failure) => {
        if (!controller.signal.aborted) setError(profileMessage(failure, en));
      })
      .finally(() => {
        if (!controller.signal.aborted && lifecycle.current === controller) {
          pending.current = false;
          setBusy(false);
        }
      });
    // Read-only setup must not publish a username or authorize an operation.
    // Keep the same pending guard as explicit actions until selection is ready.
    return () => {
      controller.abort();
      unsubscribe?.();
      session.current = null;
    };
  }, [runtime, uid, en]);
  function run(
    action: (client: NonNullable<typeof session.current>, signal: AbortSignal) => Promise<void>,
  ) {
    const controller = lifecycle.current,
      client = session.current;
    if (!controller || controller.signal.aborted || !client || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setSaved(false);
    void (async () => {
      client.assertCurrent();
      await action(client, controller.signal);
      client.assertCurrent();
    })()
      .catch((failure) => {
        if (!controller.signal.aborted) setError(profileMessage(failure, en));
      })
      .finally(() => {
        if (lifecycle.current === controller) {
          pending.current = false;
          if (!controller.signal.aborted) setBusy(false);
        }
      });
  }
  if (closed)
    return (
      <p role="alert">
        {en ? 'Your session changed. Sign in again.' : 'Tu sesión cambió. Vuelve a entrar.'}
      </p>
    );
  if (!profile)
    return (
      <Panel>
        {error ? (
          <p role="alert">{error}</p>
        ) : (
          <p role="status">{en ? 'Loading profile…' : 'Cargando perfil…'}</p>
        )}
        {error ? (
          <button className="auth-secondary btn btn-ghost btn-block" onClick={() => reloadPage()}>
            {en ? 'Reload' : 'Recargar'}
          </button>
        ) : null}
      </Panel>
    );
  const published = profile.username_published_at !== null;
  return (
    <div aria-busy={busy}>
      {error ? (
        <div className="auth-error" role="alert">
          <p>{error}</p>
          <button disabled={busy} onClick={() => reloadPage()}>
            {en ? 'Reload' : 'Recargar'}
          </button>
        </div>
      ) : null}
      {saved ? <p role="status">{en ? 'Saved.' : 'Guardado.'}</p> : null}
      <Panel>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            run(async (client, signal) => {
              const value = await client.rename(name, signal);
              if (!signal.aborted) {
                apply(value);
                setSaved(true);
              }
            });
          }}
        >
          <Field label={en ? 'Display name' : 'Nombre visible'}>
            {(id) => (
              <input
                id={id}
                value={name}
                autoComplete="name"
                maxLength={80}
                required
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>
          <button type="submit" className="auth-primary btn btn-primary btn-block" disabled={busy}>
            {en ? 'Save name' : 'Guardar nombre'}
          </button>
        </form>
      </Panel>
      <Panel>
        <h2 className="font-display text-lg">
          {en ? 'Receive by username' : 'Recibir por username'}
        </h2>
        {published ? (
          <>
            <p className="my-4">@{profile.username}</p>
            <NavigationLink
              className="auth-primary btn btn-primary btn-block"
              href={localizedPath(`/@${profile.username}`, en)}
            >
              {en ? 'Open my public receiving page' : 'Abrir mi página pública para recibir'}
            </NavigationLink>
            <p>
              {en
                ? 'Your username and receiving wallet remain fixed. Your display name can change.'
                : 'Tu username y wallet receptora quedan fijos. Puedes cambiar el nombre visible.'}
            </p>
          </>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              run(async (client, signal) => {
                const value = await client.publish(username, wallet, account, signal);
                if (!signal.aborted) {
                  apply(value);
                  setSaved(true);
                }
              });
            }}
          >
            <p className="my-4">
              {en
                ? 'Choose your receiving wallet. We will verify that it is active before publishing your username.'
                : 'Elige tu wallet receptora. Verificaremos que esté activa antes de publicar tu username.'}
            </p>
            {profile.username_reserved_until ? (
              <p>
                {en ? 'Your private reservation expires at ' : 'Tu reserva privada vence el '}
                {new Date(profile.username_reserved_until * 1000).toLocaleString(en ? 'en' : 'es')}.
              </p>
            ) : null}
            <Field label="Username">
              {(id) => (
                <input
                  id={id}
                  value={username}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  pattern="[a-z][a-z0-9_]{2,29}"
                  minLength={3}
                  maxLength={30}
                  disabled={busy}
                  onChange={(event) => setUsername(event.target.value.toLowerCase())}
                />
              )}
            </Field>
            <Field label={en ? 'Receiving wallet' : 'Wallet receptora'}>
              {(id) => (
                <select
                  id={id}
                  value={wallet}
                  required
                  disabled={busy}
                  onChange={(event) => {
                    if (pending.current) return;
                    const selected = event.target.value;
                    setWallet(selected);
                    setAccount('');
                    setAccounts({ data: [], next_cursor: null });
                    if (selected)
                      run(async (_client, signal) => {
                        const page = await runtime.balances(uid).accounts(selected, null, signal);
                        if (!signal.aborted) {
                          setAccounts(page);
                          setAccount(
                            page.next_cursor === null && page.data.length === 1
                              ? page.data[0].id
                              : '',
                          );
                        }
                      });
                  }}
                >
                  <option value="">{en ? 'Choose a wallet' : 'Elige una wallet'}</option>
                  {wallets.data
                    .filter((w) => w.status === 'active')
                    .map((w) => (
                      <option key={w.id} value={w.id}>
                        Wallet · {w.id.slice(-8)}
                      </option>
                    ))}
                </select>
              )}
            </Field>
            {wallets.next_cursor ? (
              <button
                type="button"
                className="auth-secondary btn btn-ghost btn-block"
                disabled={busy}
                onClick={() =>
                  run(async (_client, signal) => {
                    const page = await runtime.wallets(uid, signal, wallets.next_cursor);
                    if (!signal.aborted)
                      setWallets((previous) => ({
                        data: [...previous.data, ...page.data],
                        next_cursor: page.next_cursor,
                      }));
                  })
                }
              >
                {en ? 'More wallets' : 'Más wallets'}
              </button>
            ) : null}
            {wallet ? (
              <Field label={en ? 'Network to verify' : 'Red a verificar'}>
                {(id) => (
                  <select
                    id={id}
                    value={account}
                    required
                    disabled={busy}
                    onChange={(event) => setAccount(event.target.value)}
                  >
                    <option value="">{en ? 'Choose a network' : 'Elige una red'}</option>
                    {accounts.data.map((a) => (
                      <option key={a.id} value={a.id}>
                        {creationFeeUnit(a.network_id)?.network ?? a.network_id}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            ) : null}
            {accounts.next_cursor ? (
              <button
                type="button"
                className="auth-secondary btn btn-ghost btn-block"
                disabled={busy}
                onClick={() =>
                  run(async (_client, signal) => {
                    const page = await runtime
                      .balances(uid)
                      .accounts(wallet, accounts.next_cursor, signal);
                    if (!signal.aborted)
                      setAccounts((previous) => ({
                        data: [...previous.data, ...page.data],
                        next_cursor: page.next_cursor,
                      }));
                  })
                }
              >
                {en ? 'More networks' : 'Más redes'}
              </button>
            ) : null}
            <p>
              {en
                ? 'Once published, the username and receiving wallet cannot be changed in this version.'
                : 'Una vez publicados, el username y la wallet receptora no se pueden cambiar en esta versión.'}
            </p>
            <button
              className="auth-primary btn btn-primary btn-block"
              type="submit"
              disabled={busy || !wallet || !account}
            >
              {en ? 'Verify and publish username' : 'Verificar y publicar username'}
            </button>
            <NavigationLink
              className="auth-secondary btn btn-ghost btn-block"
              href={localizedPath('/onboarding', en)}
            >
              {en ? 'Continue wallet setup' : 'Continuar creación de wallet'}
            </NavigationLink>
          </form>
        )}
        <button
          type="button"
          className="auth-secondary btn btn-ghost btn-block"
          disabled={busy}
          onClick={() =>
            run(async (client, signal) => {
              const value = await client.read(signal);
              if (!signal.aborted) apply(value);
            })
          }
        >
          {en ? 'Refresh profile' : 'Actualizar perfil'}
        </button>
      </Panel>
    </div>
  );
}
