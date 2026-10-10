import type { ClientSettings } from '../lib/settings';
import { api } from './api';
import type { Session } from './session';

/** A saved group of "Group payment": its name and who is in it, as the form keeps them. */
export interface Group {
  name: string;
  members: { who: string; amount: string; share: string }[];
}

/**
 * The member's saved groups, kept by Wallet Core like the contacts, newest first. Saving a group
 * with the name of another replaces it; each call answers the list as it is now.
 */
export const listGroups = (settings: ClientSettings, session: Session) =>
  api<{ groups: Group[] }>(settings.apiOrigin, 'groups', { token: session.token }).then(
    ({ groups }) => groups,
  );

export const saveGroup = (settings: ClientSettings, session: Session, group: Group) =>
  api<{ groups: Group[] }>(settings.apiOrigin, 'groups', {
    method: 'PUT',
    token: session.token,
    body: group,
  }).then(({ groups }) => groups);

export const deleteGroup = (settings: ClientSettings, session: Session, name: string) =>
  api<{ groups: Group[] }>(settings.apiOrigin, `groups/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    token: session.token,
  }).then(({ groups }) => groups);
