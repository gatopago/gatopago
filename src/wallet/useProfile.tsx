'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
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

const PROFILE_KEY = 'gatopago:profile';

/** The profile this browser last saw for `address`: shown at once, then read again. */
function rememberedProfile(address: string): Profile | null {
  try {
    const profile = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null') as Profile | null;
    return profile?.address.toLowerCase() === address.toLowerCase() ? profile : null;
  } catch {
    return null;
  }
}

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
  const [profile, setStoredProfile] = useState<Profile | null>(() =>
    rememberedProfile(session.wallet.address),
  );
  const [error, setError] = useState('');
  const setProfile = useCallback((value: Profile) => {
    setStoredProfile(value);
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(value));
    } catch {
      // Private mode: the header waits for the profile next time.
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    api<Profile>(settings.apiOrigin, 'profile', { token: session.token, signal: controller.signal })
      .then(setProfile)
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(failureMessage(failure, en));
      });
    return () => controller.abort();
  }, [settings.apiOrigin, session.token, en, setProfile]);
  // FCM rotates tokens: a device with notifications on confirms its token on every visit.
  useEffect(() => {
    void renewPush(settings, session, en).catch(() => undefined);
  }, [settings, session, en]);
  const value = useMemo(() => ({ profile, setProfile, error }), [profile, setProfile, error]);
  return <ProfileContext value={value}>{children}</ProfileContext>;
}

/** The member's profile; `null` outside a signed-in screen or while it loads. */
export const useProfile = () => useContext(ProfileContext);
