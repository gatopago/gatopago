'use client';

import { copyText } from '../lib/clipboard';
import { useEffect, useState } from 'react';
import type { ClientSettings } from '../lib/settings';
import { CatGlyph } from '../marketing/CatGlyph';
import { api } from '../wallet/api';
import { failureMessage } from '../wallet/messages';
import type { Session } from '../wallet/session';
import { NavigationLink } from './NavigationLink';
import { BackHeader } from './Primitives';
import { localizedPath } from './routes';
import { RowSkeletonList } from './Skeleton';

interface Contact {
  username: string;
  display_name: string | null;
  address: string;
}

/** `/contacts`, V2's "friends": people to pay in one tap, and invitations to join. */
export function ContactsScreen({
  settings,
  session,
  english: en,
}: {
  settings: ClientSettings;
  session: Session;
  english: boolean;
}) {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [invites, setInvites] = useState<{ invited: number; code: string | null } | null>(null);
  const [username, setUsername] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const request = <T,>(path: string, init: { method?: string; body?: unknown } = {}) =>
    api<T>(settings.apiOrigin, path, { ...init, token: session.token });

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    const get = <T,>(path: string) =>
      api<T>(settings.apiOrigin, path, { token: session.token, signal });
    get<{ contacts: Contact[] }>('contacts')
      .then(({ contacts }) => setContacts(contacts))
      .catch(() => {
        if (!signal.aborted) setContacts([]);
      });
    get<{ invited: number; code: string | null }>('invites')
      .then(setInvites)
      .catch(() => undefined);
    return () => controller.abort();
  }, [settings, session]);

  function add() {
    if (!username) return;
    setAdding(true);
    setNotice(null);
    request<{ contact: Contact }>('contacts', { body: { username } })
      .then(({ contact }) => {
        setContacts((current) => [
          contact,
          ...(current ?? []).filter((item) => item.username !== contact.username),
        ]);
        setUsername('');
        setNotice({ error: false, text: en ? 'Contact added' : 'Contacto agregado' });
      })
      .catch((failure: unknown) => setNotice({ error: true, text: failureMessage(failure, en) }))
      .finally(() => setAdding(false));
  }

  // Optimistic removal with rollback: the list never claims what the server does not have.
  function remove(contact: Contact) {
    setRemoving(null);
    const previous = contacts;
    setContacts((current) => (current ?? []).filter((item) => item !== contact));
    request(`contacts/${contact.username}`, { method: 'DELETE' }).catch(() => {
      setContacts(previous);
      setNotice({
        error: true,
        text: en ? "Couldn't remove the contact" : 'No se pudo eliminar el contacto',
      });
    });
  }

  async function invite() {
    const { code } = await request<{ invited: number; code: string }>('invites', {
      method: 'POST',
    }).then((value) => {
      setInvites(value);
      return value;
    });
    const url = `${settings.webOrigin}/login#invite=${code}`;
    const text = en
      ? 'Join GatoPago: your dollars already know how to move.'
      : 'Únete a GatoPago: tus dólares ya saben moverse.';
    if (navigator.share) {
      await navigator.share({ title: 'GatoPago', text, url }).catch(() => undefined);
      return;
    }
    await copyText(url);
    setNotice({ error: false, text: en ? 'Invite link copied' : 'Link de invitación copiado' });
  }

  return (
    <>
      <BackHeader title={en ? 'Contacts' : 'Contactos'} english={en} />

      <div className="meli-paper-card meli-paper-card--strong relative mb-6 overflow-hidden p-5">
        <div className="pointer-events-none absolute top-0 right-5 h-1 w-12 bg-cat-500 shadow-[8px_4px_0_var(--color-cat-700)]" />
        <div className="relative z-1 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="mb-1 font-display text-[17px]">
              {en ? 'Invite your friends' : 'Invita a tus amigos'}
            </p>
            <p className="text-[13px] leading-relaxed text-text-muted">
              {invites === null
                ? en
                  ? 'Share your code and send each other money instantly, with no fees.'
                  : 'Comparte tu código y pásense dinero al instante, sin comisiones.'
                : invites.invited === 0
                  ? en
                    ? 'No one has joined with your code yet. Share it!'
                    : 'Aún nadie se unió con tu código. ¡Compártelo!'
                  : en
                    ? `${invites.invited} ${invites.invited === 1 ? 'friend' : 'friends'} joined with your invite`
                    : `${invites.invited} ${invites.invited === 1 ? 'amigo se unió' : 'amigos se unieron'} con tu invitación`}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm shrink-0"
            onClick={() =>
              void invite().catch((failure: unknown) =>
                setNotice({ error: true, text: failureMessage(failure, en) }),
              )
            }
          >
            {en ? 'Invite' : 'Invitar'}
          </button>
        </div>
        {invites?.code ? (
          <button
            type="button"
            onClick={() =>
              void copyText(invites.code!).then(() =>
                setNotice({ error: false, text: en ? 'Code copied' : 'Código copiado' }),
              )
            }
            className="relative z-1 mt-3.5 flex items-center gap-2.5 border border-border bg-surface-2 px-3.5 py-2"
          >
            <span className="text-[12px] text-text-faint">{en ? 'Your code' : 'Tu código'}</span>
            <span className="font-mono text-[14px] tracking-[0.2em] text-pending">
              {invites.code}
            </span>
            <svg
              aria-hidden="true"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-text-faint"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
        ) : null}
      </div>

      <form
        className="mb-6 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <div className="flex h-12 min-w-0 flex-1 items-center gap-1.5 border-2 border-text bg-surface px-4">
          <span className="shrink-0 text-[14px] text-text-faint">@</span>
          <input
            type="text"
            name="username"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-label={en ? 'Username to add' : 'Usuario a agregar'}
            value={username}
            onChange={(event) =>
              setUsername(event.target.value.replace(/[^a-z0-9_]/gi, '').toLowerCase())
            }
            placeholder={en ? 'username' : 'usuario'}
            maxLength={30}
            className="min-w-0 flex-1 bg-transparent text-[14px] text-text placeholder:text-text-faint"
          />
        </div>
        <button
          type="submit"
          disabled={adding || !username}
          className="btn btn-primary btn-sm h-12 shrink-0"
        >
          {adding ? '…' : en ? 'Add' : 'Agregar'}
        </button>
      </form>

      {notice ? (
        <p
          role={notice.error ? 'alert' : 'status'}
          className={`-mt-3 mb-5 text-[12px] ${notice.error ? 'text-danger' : 'text-growth'}`}
        >
          {notice.text}
        </p>
      ) : null}

      {contacts === null ? (
        <RowSkeletonList count={5} />
      ) : contacts.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <CatGlyph className="mb-4 w-10 opacity-40" decorative />
          <p className="max-w-[240px] text-[14px] leading-relaxed text-text-muted">
            {en
              ? 'Add your friends by their username to pay them in one tap.'
              : 'Agrega a tus amigos por su usuario para pagarles en un toque.'}
          </p>
        </div>
      ) : (
        <div className="meli-paper-card flex flex-col">
          {contacts.map((contact) => (
            <div
              key={contact.username}
              className="flex items-center gap-3.5 border-b border-border px-3 py-3 last:border-b-0"
            >
              <NavigationLink
                href={localizedPath(`/@${contact.username}`, en)}
                className="flex min-w-0 flex-1 items-center gap-3.5 text-left"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-text bg-cat-500 font-display uppercase text-on-cat">
                  {(contact.display_name || contact.username)[0]}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[15px]">
                    {contact.display_name || `@${contact.username}`}
                  </span>
                  {contact.display_name ? (
                    <span className="block truncate text-[12px] text-text-faint">
                      @{contact.username}
                    </span>
                  ) : null}
                </span>
              </NavigationLink>
              {removing === contact.username ? (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => remove(contact)}
                    className="bg-danger/10 px-2.5 py-1.5 text-[13px] font-medium text-danger"
                  >
                    {en ? 'Remove' : 'Eliminar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoving(null)}
                    className="bg-surface-2 px-2 py-1.5 text-[13px] text-text-muted"
                  >
                    {en ? 'Cancel' : 'Cancelar'}
                  </button>
                </div>
              ) : (
                <>
                  <NavigationLink
                    href={localizedPath(`/send?username=${contact.username}`, en)}
                    className="shrink-0 px-2 py-1.5 text-[13px] font-semibold text-cat-300"
                  >
                    {en ? 'Pay' : 'Pagar'}
                  </NavigationLink>
                  <button
                    type="button"
                    onClick={() => setRemoving(contact.username)}
                    aria-label={en ? `Remove ${contact.username}` : `Eliminar ${contact.username}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center text-text-faint"
                  >
                    <svg
                      aria-hidden="true"
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 6h18" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
