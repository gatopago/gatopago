'use client';

import { useEffect, useState } from 'react';
import type { ClientSettings } from '../lib/settings';
import { useActivity } from '../wallet/activity';
import { api } from '../wallet/api';
import type { Session } from '../wallet/session';
import { useTranslations } from 'next-intl';

const LIMIT = 8;

/**
 * The people this account pays: whom it sent to lately, then its contacts. One tap fills the
 * recipient, so nobody has to remember an @username.
 */
export function RecipientShortcuts({
  settings,
  session,
  selected = [],
  onPick,
  className = '',
}: {
  settings: ClientSettings;
  session: Session;
  /** Usernames already chosen, shown as pressed. */
  selected?: readonly string[];
  onPick: (username: string) => void;
  className?: string;
}) {
  const t = useTranslations('RecipientShortcuts');
  const { movements } = useActivity(settings, session);
  const [contacts, setContacts] = useState<{ username: string; display_name: string | null }[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    api<{ contacts: { username: string; display_name: string | null }[] }>(
      settings.apiOrigin,
      'contacts',
      { token: session.token, signal: controller.signal },
    )
      .then(({ contacts }) => setContacts(contacts))
      .catch(() => undefined);
    return () => controller.abort();
  }, [settings.apiOrigin, session.token]);

  const people = new Map<string, string | null>();
  for (const movement of movements ?? [])
    if (movement.direction === 'sent' && movement.counterparty_username)
      people.set(movement.counterparty_username, movement.counterparty_display_name ?? null);
  for (const contact of contacts)
    if (!people.has(contact.username)) people.set(contact.username, contact.display_name);
  const shown = [...people].slice(0, LIMIT);
  if (!shown.length) return null;

  return (
    <div className={className}>
      <p className="mb-2 text-[12px] text-text-muted">{t('recentContacts')}</p>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {shown.map(([username, name]) => {
          const pressed = selected.includes(username);
          return (
            <button
              key={username}
              type="button"
              aria-pressed={pressed}
              title={name ?? undefined}
              onClick={() => onPick(username)}
              className={`interactive-surface flex min-h-11 shrink-0 items-center gap-2 border px-2.5 text-[13px] ${pressed ? 'border-text bg-cat-500/15' : 'border-border bg-surface'}`}
            >
              <span
                aria-hidden="true"
                className="flex h-6 w-6 items-center justify-center bg-cat-500 font-display text-[12px] font-bold uppercase text-on-cat"
              >
                {(name ?? username)[0]}
              </span>
              @{username}
            </button>
          );
        })}
      </div>
    </div>
  );
}
