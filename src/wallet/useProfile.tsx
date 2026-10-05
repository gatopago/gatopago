'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ClientSettings } from '../lib/settings';
import { api, type Profile } from './api';
import { failureMessage } from './messages';
import { renewPush } from './push';
import type { Session } from './session';

interface ProfileState {
  profile: Profile | null;
  setProfile: (profile: Profile) => void;
  error: string;
}

const ProfileContext = createContext<ProfileState>({
  profile: null,
  setProfile: () => undefined,
  error: '',
});

/**
 * Loads the signed-in member's profile once for the header, the menu and every screen, and keeps
 * this device's notification registration current.
 */
export function ProfileProvider({
  settings,
  session,
  english: en,
  children,
}: {
  settings: ClientSettings;
  session: Session;
  english: boolean;
  children: ReactNode;
}) {
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
  // FCM rotates tokens: a device with notifications on confirms its token on every visit.
  useEffect(() => {
    void renewPush(settings, session, en).catch(() => undefined);
  }, [settings, session, en]);
  return <ProfileContext value={{ profile, setProfile, error }}>{children}</ProfileContext>;
}

/** The member's profile; `null` outside a signed-in screen or while it loads. */
export const useProfile = () => useContext(ProfileContext);
