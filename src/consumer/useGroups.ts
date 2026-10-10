'use client';

import { useEffect, useRef, useState } from 'react';
import type { ClientSettings } from '../lib/settings';
import { deleteGroup, listGroups, saveGroup, type Group } from '../wallet/groups';
import type { Session } from '../wallet/session';
import { useAction } from '../wallet/useAction';

/**
 * "My groups" of Group payment, kept by Wallet Core: the list, whether reading it failed, and
 * saving or deleting one. A list read before a save or delete that succeeded is older than what
 * that answered, so it never replaces it.
 */
export function useGroups(settings: ClientSettings, session: Session) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const revision = useRef(0);
  const { busy, error, run } = useAction();

  useEffect(() => {
    let active = true;
    const asked = revision.current;
    listGroups(settings, session)
      .then((list) => {
        if (active && asked === revision.current) setGroups(list);
      })
      .catch(() => {
        if (active && asked === revision.current) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [settings, session, reload]);

  /** The list as Wallet Core answered a change, newer than any read still on its way. */
  function answered(list: Group[]) {
    revision.current++;
    setGroups(list);
    setFailed(false);
  }

  return {
    groups,
    failed,
    busy,
    error,
    retry: () => {
      setFailed(false);
      setReload((current) => current + 1);
    },
    /** Saves a group; one with the same name is replaced. Resolves whether it was saved. */
    save: (group: Group) => run(async () => answered(await saveGroup(settings, session, group))),
    /** Deletes a group by its name. Resolves whether it was deleted. */
    remove: (name: string) => run(async () => answered(await deleteGroup(settings, session, name))),
  };
}
