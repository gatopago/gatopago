'use client';

import type { ClientSettings } from '../lib/settings';
import { api } from './api';
import type { Session } from './session';
import type { Locale } from 'next-intl';

/**
 * Notifications are a setting of this device: once turned on, whoever signs in here gets theirs.
 * Kept: the FCM token, the account it is registered for (`null` while signed out, which
 * unregisters it) and the language, to register again when any of them changes.
 */
const REGISTRATION_KEY = 'gatopago:push-registration';
interface Registration {
  token: string;
  account: string | null;
  language: Locale;
}

function keep(registration: Registration) {
  try {
    localStorage.setItem(REGISTRATION_KEY, JSON.stringify(registration));
  } catch {
    // Without storage the token is registered again next time; the server keeps one row.
  }
}

function stored(): Registration | null {
  try {
    const value = JSON.parse(localStorage.getItem(REGISTRATION_KEY) ?? 'null') as Registration;
    return typeof value?.token === 'string' ? value : null;
  } catch {
    return null;
  }
}

/** Whether this browser can receive payment notifications (iOS: only the installed app). */
export async function pushSupported(settings: ClientSettings) {
  if (!settings.push || !('serviceWorker' in navigator) || !('Notification' in window))
    return false;
  const { isSupported } = await import('firebase/messaging');
  return isSupported().catch(() => false);
}

export const pushEnabled = () =>
  'Notification' in window && Notification.permission === 'granted' && stored() !== null;

/**
 * Whether this site's notifications are blocked: the browser no longer asks, so a tap cannot turn
 * them on; only its settings (or the phone's, for the installed app) can.
 */
export const notificationsBlocked = () =>
  'Notification' in window && Notification.permission === 'denied';

/** Calls `listener` when the permission may have changed: the browser says so, or the person is back. */
export function subscribeNotificationPermission(listener: () => void) {
  let active = true;
  let status: PermissionStatus | null = null;
  navigator.permissions
    ?.query({ name: 'notifications' })
    .then((result) => {
      if (!active) return;
      status = result;
      result.addEventListener('change', listener);
    })
    // Without the Permissions API, coming back from the settings is enough.
    .catch(() => {});
  document.addEventListener('visibilitychange', listener);
  return () => {
    active = false;
    status?.removeEventListener('change', listener);
    document.removeEventListener('visibilitychange', listener);
  };
}

/** How long the PWA's worker may take to activate before turning notifications on fails. */
const WORKER_WAIT_MS = 15_000;

async function register(settings: ClientSettings, session: Session, locale: Locale) {
  const push = settings.push!;
  const [{ initializeApp, getApps }, { getMessaging, getToken }] = await Promise.all([
    import('firebase/app'),
    import('firebase/messaging'),
  ]);
  const app = getApps()[0] ?? initializeApp(push.firebase);
  // The PWA's worker receives the pushes (public/sw.js); Firebase only creates the subscription,
  // which needs that worker active: right after installing or updating it may not be yet.
  if (!(await navigator.serviceWorker.getRegistration('/')))
    await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
  // `ready` never fails: a worker that cannot activate would leave the button waiting forever.
  let waiting: ReturnType<typeof setTimeout> | undefined;
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => {
      waiting = setTimeout(() => reject(new Error('WORKER_NOT_READY')), WORKER_WAIT_MS);
    }),
  ]).finally(() => clearTimeout(waiting));
  const token = await getToken(getMessaging(app), {
    vapidKey: push.vapidKey,
    serviceWorkerRegistration: registration,
  });
  if (!token) return false;
  // Another account signed in on this device (or the language changed): the token moves to it, so
  // the earlier account's payments stop showing here.
  const current: Registration = {
    token,
    account: session.wallet.address.toLowerCase(),
    language: locale,
  };
  const last = stored();
  if (
    last?.token !== current.token ||
    last.account !== current.account ||
    last.language !== current.language
  ) {
    await api(settings.apiOrigin, 'push-tokens', {
      token: session.token,
      body: { token, language: current.language },
    });
    keep(current);
  }
  return true;
}

/**
 * How turning notifications on ended: `dismissed` when the person closed the browser's prompt
 * without answering (asking again is enough), `blocked` when the browser denied the permission
 * (only its settings change that), `failed` when it was given but Firebase or GatoPago could not
 * register this device.
 */
export type PushOutcome = 'on' | 'dismissed' | 'blocked' | 'failed';

/** Asks for permission and registers this device. Call it from a tap (browsers require it). */
export async function enablePush(
  settings: ClientSettings,
  session: Session,
  locale: Locale,
): Promise<PushOutcome> {
  if (!(await pushSupported(settings))) return 'failed';
  const permission = await Notification.requestPermission();
  if (permission === 'denied') return 'blocked';
  if (permission !== 'granted') return 'dismissed';
  return (await register(settings, session, locale).catch(() => false)) ? 'on' : 'failed';
}

/**
 * On every visit of a device with notifications on: FCM rotates tokens, and after signing in again
 * (or as another account) the device registers for the account in use, without asking.
 */
export async function renewPush(settings: ClientSettings, session: Session, locale: Locale) {
  if (pushEnabled() && (await pushSupported(settings))) await register(settings, session, locale);
}

/**
 * Stops this account's notifications here on sign-out, with the session being left (still valid on
 * the server): the sign-out itself does not wait for it. The device keeps them on for the next
 * sign-in.
 */
export async function disablePush(settings: ClientSettings, session: Session) {
  const registration = stored();
  if (!registration?.account) return;
  keep({ ...registration, account: null });
  await api(settings.apiOrigin, `push-tokens/${encodeURIComponent(registration.token)}`, {
    method: 'DELETE',
    token: session.token,
  }).catch(() => undefined);
}

const REFRESH = 'gatopago:refresh';

/** Asks the screens to read their data again, as a movement notification does (pull to refresh). */
export const refreshScreens = () => window.dispatchEvent(new Event(REFRESH));

/**
 * Fires `listener` when the service worker relays a movement notification, or when the person
 * pulls the screen down to refresh it.
 */
export function onMovement(listener: () => void) {
  window.addEventListener(REFRESH, listener);
  const handle = (event: MessageEvent) => {
    if (event.data?.type === 'GATOPAGO_MOVEMENT') listener();
  };
  const worker = 'serviceWorker' in navigator ? navigator.serviceWorker : null;
  worker?.addEventListener('message', handle);
  return () => {
    window.removeEventListener(REFRESH, listener);
    worker?.removeEventListener('message', handle);
  };
}
