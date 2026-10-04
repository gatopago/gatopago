import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function browser(standalone = false) {
  const win = Object.assign(new EventTarget(), {
    location: { origin: 'https://gatopago.com', reload: vi.fn() },
    matchMedia: vi.fn(),
  });
  const display = Object.assign(new EventTarget(), { matches: standalone });
  win.matchMedia.mockReturnValue(display);
  const registration = Object.assign(new EventTarget(), {
    active: {} as object | null,
    waiting: null as object | null,
    installing: new EventTarget(),
  });
  const serviceWorker = Object.assign(new EventTarget(), {
    register: vi.fn().mockResolvedValue(registration),
  });
  vi.stubGlobal('window', win);
  vi.stubGlobal('navigator', { serviceWorker, standalone: false });
  return { win, display, registration, serviceWorker };
}
beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const canonical = 'https://gatopago.com';

describe('browser PWA lifecycle', () => {
  it('does not create runtime state on the server', async () => {
    vi.stubGlobal('window', undefined);
    const pwa = await import('../src/pwa/browser');
    pwa.startPwa(canonical, true);
    expect(pwa.getPwaSnapshot()).toBe(pwa.getServerPwaSnapshot());
  });
  it.each([
    [canonical, true, true],
    ['http://127.0.0.1:3000', true, true],
    ['http://localhost:3000', true, true],
    [canonical, false, false],
    ['https://preview.vercel.app', true, false],
    ['https://gatopago.com.attacker.test', true, false],
    ['https://api.gatopago.com', true, false],
    ['http://gatopago.com', true, false],
  ])(
    'confines registration to release builds at canonical/loopback origins (%s)',
    async (origin, release, expected) => {
      const { mayRegisterWorker } = await import('../src/pwa/browser');
      expect(mayRegisterWorker(origin, canonical, release)).toBe(expected);
    },
  );
  it('initializes exactly once across strict remounts and keeps one listener set', async () => {
    const env = browser();
    const listen = vi.spyOn(env.win, 'addEventListener');
    const pwa = await import('../src/pwa/browser');
    pwa.startPwa(canonical, true);
    pwa.startPwa(canonical, true);
    await Promise.resolve();
    expect(env.serviceWorker.register).toHaveBeenCalledExactlyOnceWith('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
    expect(listen.mock.calls.map(([name]) => name)).toEqual([
      'pageshow',
      'beforeinstallprompt',
      'appinstalled',
    ]);
    expect(pwa.getPwaSnapshot()).toMatchObject({ ready: true, installed: false });
  });
  it('does not install a service worker during development or on preview', async () => {
    const env = browser();
    const pwa = await import('../src/pwa/browser');
    pwa.startPwa(canonical, false);
    expect(env.serviceWorker.register).not.toHaveBeenCalled();
  });
  it('observes a waiting update without messaging, claiming or reloading tabs', async () => {
    const env = browser();
    const pwa = await import('../src/pwa/browser');
    pwa.startPwa(canonical, true);
    await Promise.resolve();
    env.registration.waiting = {};
    env.registration.installing.dispatchEvent(new Event('statechange'));
    expect(pwa.getPwaSnapshot().waiting).toBe(true);
    expect(env.win.location.reload).not.toHaveBeenCalled();
    env.registration.waiting = null;
    env.serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(pwa.getPwaSnapshot().waiting).toBe(false);
    expect(env.win.location.reload).not.toHaveBeenCalled();
  });
  it('detects standalone including iOS but does not persist a guessed OS installation', async () => {
    const env = browser();
    const pwa = await import('../src/pwa/browser');
    pwa.startPwa(canonical, false);
    env.win.dispatchEvent(new Event('appinstalled'));
    expect(pwa.getPwaSnapshot().installed).toBe(false);
    env.display.matches = true;
    env.display.dispatchEvent(new Event('change'));
    expect(pwa.getPwaSnapshot().installed).toBe(true);
    env.display.matches = false;
    Object.assign(navigator, { standalone: true });
    env.win.dispatchEvent(new Event('pageshow'));
    expect(pwa.getPwaSnapshot().installed).toBe(true);
  });
  it('only prompts on a user request, consumes the capability once and handles dismissal', async () => {
    const env = browser();
    const pwa = await import('../src/pwa/browser');
    pwa.startPwa(canonical, true);
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'dismissed' }),
    });
    env.win.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(prompt).not.toHaveBeenCalled();
    expect(pwa.getPwaSnapshot().canPrompt).toBe(true);
    expect(await pwa.requestInstall()).toBe('dismissed');
    expect(prompt).toHaveBeenCalledOnce();
    expect(await pwa.requestInstall()).toBe('instructions');
    expect(prompt).toHaveBeenCalledOnce();
  });
  it('does not claim an accepted prompt proves standalone launch or a financial account', async () => {
    const env = browser();
    const pwa = await import('../src/pwa/browser');
    pwa.startPwa(canonical, true);
    env.win.dispatchEvent(
      Object.assign(new Event('beforeinstallprompt'), {
        prompt: async () => undefined,
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      }),
    );
    expect(await pwa.requestInstall()).toBe('accepted');
    expect(pwa.getPwaSnapshot().installed).toBe(false);
  });
  it('releases a stalled native prompt after 30 seconds without retrying it', async () => {
    vi.useFakeTimers();
    const env = browser();
    const pwa = await import('../src/pwa/browser');
    pwa.startPwa(canonical, true);
    const prompt = vi.fn(() => new Promise<void>(() => undefined));
    env.win.dispatchEvent(
      Object.assign(new Event('beforeinstallprompt'), {
        prompt,
        userChoice: new Promise(() => undefined),
      }),
    );
    const result = pwa.requestInstall();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await result).toBe('instructions');
    expect(prompt).toHaveBeenCalledOnce();
    expect(pwa.getPwaSnapshot().canPrompt).toBe(false);
  });
  it('exposes registration failure without failing the rest of the web', async () => {
    const env = browser();
    env.serviceWorker.register.mockRejectedValue(new Error('Storage unavailable'));
    const pwa = await import('../src/pwa/browser');
    pwa.startPwa(canonical, true);
    await Promise.resolve();
    await Promise.resolve();
    expect(pwa.getPwaSnapshot()).toMatchObject({ ready: true, workerError: true });
    expect(env.win.location.reload).not.toHaveBeenCalled();
  });
  it('honors all active operation holds; release is idempotent and never triggers deferred reload/install', async () => {
    const env = browser();
    const guard = await import('../src/pwa/reload-guard');
    const pwa = await import('../src/pwa/browser');
    const notify = vi.fn();
    const unsubscribe = guard.subscribeReloadGuard(notify);
    const a = guard.holdPageReload();
    const b = guard.holdPageReload();
    expect(guard.reloadPage()).toBe(false);
    expect(await pwa.requestInstall()).toBe('blocked');
    a();
    a();
    expect(guard.isReloadBlocked()).toBe(true);
    b();
    expect(guard.isReloadBlocked()).toBe(false);
    expect(notify).toHaveBeenCalledTimes(4);
    expect(env.win.location.reload).not.toHaveBeenCalled();
    expect(guard.reloadPage()).toBe(true);
    expect(env.win.location.reload).toHaveBeenCalledOnce();
    unsubscribe();
  });
});
