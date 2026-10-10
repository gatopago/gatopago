import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientSettings } from '../src/lib/settings';
import type { Session } from '../src/wallet/session';

// Firebase and the browser's notifications are simulated: one FCM token for this device.
const calls = vi.hoisted(() => ({ api: [] as { path: string; token?: string }[] }));
vi.mock('firebase/app', () => ({ getApps: () => [{}], initializeApp: () => ({}) }));
vi.mock('firebase/messaging', () => ({
  isSupported: async () => true,
  getMessaging: () => ({}),
  getToken: async () => 'fcm-device',
}));
vi.mock('../src/wallet/api', () => ({
  api: async (_origin: string, path: string, init: { token?: string }) => {
    calls.api.push({ path, token: init.token });
    return {};
  },
}));

const settings = {
  apiOrigin: 'https://api.gatopago.com',
  push: { firebase: {}, vapidKey: 'vapid' },
} as unknown as ClientSettings;
const session = (address: string) =>
  ({ token: `session-${address}`, wallet: { address } }) as unknown as Session;

beforeEach(() => {
  vi.resetModules();
  calls.api = [];
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal('window', { Notification: {} });
  vi.stubGlobal('Notification', {
    permission: 'granted',
    requestPermission: async () => 'granted',
  });
  vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => ({}) } });
});
afterEach(() => vi.unstubAllGlobals());

describe('payment notifications', () => {
  it('follow the account signed in on this device, not the one before', async () => {
    const { disablePush, enablePush, pushEnabled, renewPush } = await import('../src/wallet/push');
    const alice = '0x1111111111111111111111111111111111111111';
    const bob = '0x2222222222222222222222222222222222222222';
    await enablePush(settings, session(alice), false);
    // The same account on its next visit: nothing to register again.
    await renewPush(settings, session(alice), false);
    // Alice's session ended without signing out; Bob signs in on the same device.
    await renewPush(settings, session(bob), false);
    // And Bob switches the app to English.
    await renewPush(settings, session(bob), true);
    // Bob signs out: his notifications stop here, and they come back when he signs in again.
    await disablePush(settings, session(bob));
    expect(pushEnabled()).toBe(true);
    await renewPush(settings, session(bob), true);
    expect(calls.api).toEqual([
      { path: 'push-tokens', token: `session-${alice}` },
      { path: 'push-tokens', token: `session-${bob}` },
      { path: 'push-tokens', token: `session-${bob}` },
      { path: 'push-tokens/fcm-device', token: `session-${bob}` },
      { path: 'push-tokens', token: `session-${bob}` },
    ]);
  });
});
