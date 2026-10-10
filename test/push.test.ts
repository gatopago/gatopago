import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientSettings } from '../src/lib/settings';
import type { Session } from '../src/wallet/session';

// Firebase and the browser's notifications are simulated: one FCM token for this device.
const calls = vi.hoisted(() => ({ api: [] as { path: string; token?: string }[], fail: false }));
vi.mock('firebase/app', () => ({ getApps: () => [{}], initializeApp: () => ({}) }));
vi.mock('firebase/messaging', () => ({
  isSupported: async () => true,
  getMessaging: () => ({}),
  getToken: async () => 'fcm-device',
}));
vi.mock('../src/wallet/api', () => ({
  api: async (_origin: string, path: string, init: { token?: string }) => {
    if (calls.fail) throw new Error('unavailable');
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
  calls.fail = false;
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
  vi.stubGlobal('navigator', {
    serviceWorker: { getRegistration: async () => ({}), ready: Promise.resolve({}) },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('payment notifications', () => {
  it('follow the account signed in on this device, not the one before', async () => {
    const { disablePush, enablePush, pushEnabled, renewPush } = await import('../src/wallet/push');
    const alice = '0x1111111111111111111111111111111111111111';
    const bob = '0x2222222222222222222222222222222222222222';
    expect(await enablePush(settings, session(alice), 'es')).toBe('on');
    // The same account on its next visit: nothing to register again.
    await renewPush(settings, session(alice), 'es');
    // Alice's session ended without signing out; Bob signs in on the same device.
    await renewPush(settings, session(bob), 'es');
    // And Bob switches the app to English.
    await renewPush(settings, session(bob), 'en');
    // Bob signs out: his notifications stop here, and they come back when he signs in again.
    await disablePush(settings, session(bob));
    expect(pushEnabled()).toBe(true);
    await renewPush(settings, session(bob), 'en');
    expect(calls.api).toEqual([
      { path: 'push-tokens', token: `session-${alice}` },
      { path: 'push-tokens', token: `session-${bob}` },
      { path: 'push-tokens', token: `session-${bob}` },
      { path: 'push-tokens/fcm-device', token: `session-${bob}` },
      { path: 'push-tokens', token: `session-${bob}` },
    ]);
  });

  it('tell a blocked permission apart from a registration that failed', async () => {
    const { enablePush } = await import('../src/wallet/push');
    const alice = '0x1111111111111111111111111111111111111111';
    vi.stubGlobal('Notification', {
      permission: 'denied',
      requestPermission: async () => 'denied',
    });
    expect(await enablePush(settings, session(alice), 'es')).toBe('blocked');
    expect(calls.api).toEqual([]);
    // With the permission given, a server that does not answer is not the browser's fault.
    vi.stubGlobal('Notification', {
      permission: 'granted',
      requestPermission: async () => 'granted',
    });
    calls.fail = true;
    expect(await enablePush(settings, session(alice), 'es')).toBe('failed');
  });

  it('treat a prompt closed without an answer as nothing to report', async () => {
    const { enablePush } = await import('../src/wallet/push');
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: async () => 'default',
    });
    expect(
      await enablePush(settings, session('0x1111111111111111111111111111111111111111'), 'es'),
    ).toBe('dismissed');
  });

  it('give up on a worker that never activates instead of waiting forever', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      vi.stubGlobal('navigator', {
        serviceWorker: { getRegistration: async () => ({}), ready: new Promise(() => {}) },
      });
      const { enablePush } = await import('../src/wallet/push');
      const outcome = enablePush(
        settings,
        session('0x1111111111111111111111111111111111111111'),
        'es',
      );
      await vi.advanceTimersByTimeAsync(15_000);
      expect(await outcome).toBe('failed');
      expect(calls.api).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
