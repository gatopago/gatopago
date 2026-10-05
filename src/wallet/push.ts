'use client';

import type { ClientSettings } from '../lib/settings';
import { api } from './api';
import type { Session } from './session';

/** The FCM token this device registered, kept to unregister it on sign-out. */
const TOKEN_KEY = 'gatopago:push-token';

const stored = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

/** Whether this browser can receive payment notifications (iOS: only the installed app). */
export async function pushSupported(settings: ClientSettings) {
  if (!settings.push || !('serviceWorker' in navigator) || !('Notification' in window))
    return false;
  const { isSupported } = await import('firebase/messaging');
  return isSupported().catch(() => false);
}

export const pushEnabled = () =>
  'Notification' in window && Notification.permission === 'granted' && stored() !== null;

async function register(settings: ClientSettings, session: Session, en: boolean) {
  const push = settings.push!;
  const [{ initializeApp, getApps }, { getMessaging, getToken }] = await Promise.all([
    import('firebase/app'),
    import('firebase/messaging'),
  ]);
  const app = getApps()[0] ?? initializeApp(push.firebase);
  // The PWA's worker receives the pushes (public/sw.js); Firebase only creates the subscription.
  const registration =
    (await navigator.serviceWorker.getRegistration('/')) ??
    (await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }));
  const token = await getToken(getMessaging(app), {
    vapidKey: push.vapidKey,
    serviceWorkerRegistration: registration,
  });
  if (!token) return false;
  if (token !== stored()) {
    await api(settings.apiOrigin, 'push-tokens', {
      token: session.token,
      body: { token, language: en ? 'en' : 'es' },
    });
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // Without storage the token is registered again next time; the server keeps one row.
    }
  }
  return true;
}

/** Asks for permission and registers this device. Call it from a tap (browsers require it). */
export async function enablePush(settings: ClientSettings, session: Session, en: boolean) {
  if (!(await pushSupported(settings))) return false;
  if ((await Notification.requestPermission()) !== 'granted') return false;
  return register(settings, session, en);
}

/** FCM rotates tokens: an enabled device confirms its token when the app starts. */
export async function renewPush(settings: ClientSettings, session: Session, en: boolean) {
  if (pushEnabled() && (await pushSupported(settings))) await register(settings, session, en);
}

/** Stops notifications to this device: on sign-out, before the session is forgotten. */
export async function disablePush(settings: ClientSettings, session: Session) {
  const token = stored();
  if (!token) return;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing stored to remove.
  }
  await api(settings.apiOrigin, `push-tokens/${encodeURIComponent(token)}`, {
    method: 'DELETE',
    token: session.token,
  }).catch(() => undefined);
}

/** Fires `listener` when the service worker relays a movement notification. */
export function onMovement(listener: () => void) {
  if (!('serviceWorker' in navigator)) return () => {};
  const handle = (event: MessageEvent) => {
    if (event.data?.type === 'GATOPAGO_MOVEMENT') listener();
  };
  navigator.serviceWorker.addEventListener('message', handle);
  return () => navigator.serviceWorker.removeEventListener('message', handle);
}
