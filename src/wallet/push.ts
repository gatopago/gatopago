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

/** Fires `listener` when the service worker relays a movement notification. */
export function onMovement(listener: () => void) {
  if (!('serviceWorker' in navigator)) return () => {};
  const handle = (event: MessageEvent) => {
    if (event.data?.type === 'GATOPAGO_MOVEMENT') listener();
  };
  navigator.serviceWorker.addEventListener('message', handle);
  return () => navigator.serviceWorker.removeEventListener('message', handle);
}
