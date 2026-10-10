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
import { useFailureMessage } from './messages';
import { renewPush } from './push';
import type { Session } from './session';
import { useLocale } from 'next-intl';

interface ProfileState {
  profile: Profile | null;
  setProfile: (profile: Profile) => void;
  /** Why the last read failed; cleared by the next profile that arrives. */
  error: string;
  /** Reads the profile again, after a failure. */
  retry: () => void;
}

const ProfileContext = createContext<ProfileState>({
  profile: null,
  setProfile: () => undefined,
  error: '',
  retry: () => undefined,
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
  children,
}: {
  settings: ClientSettings;
  session: Session;
  children: ReactNode;
}) {
  const messageFor = useFailureMessage();
  const locale = useLocale();
  const [profile, setStoredProfile] = useState<Profile | null>(() =>
    rememberedProfile(session.wallet.address),
  );
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setError('');
    setAttempt((current) => current + 1);
  }, []);
  const setProfile = useCallback((value: Profile) => {
    setStoredProfile(value);
    setError('');
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
        if (!controller.signal.aborted) setError(messageFor(failure));
      });
    return () => controller.abort();
  }, [settings.apiOrigin, session.token, messageFor, setProfile, attempt]);
  // FCM rotates tokens: a device with notifications on confirms its token on every visit.
  useEffect(() => {
    void renewPush(settings, session, locale).catch(() => undefined);
  }, [settings, session, locale]);
  const value = useMemo(
    () => ({ profile, setProfile, error, retry }),
    [profile, setProfile, error, retry],
  );
  return <ProfileContext value={value}>{children}</ProfileContext>;
}

/** The member's profile; `null` outside a signed-in screen or while it loads. */
export const useProfile = () => useContext(ProfileContext);
