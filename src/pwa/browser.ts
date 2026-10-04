import { isReloadBlocked } from './reload-guard';

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};
type Snapshot = Readonly<{
  ready: boolean;
  installed: boolean;
  canPrompt: boolean;
  waiting: boolean;
  workerError: boolean;
}>;
const SERVER_PWA: Snapshot = {
  ready: false,
  installed: false,
  canPrompt: false,
  waiting: false,
  workerError: false,
};
let snapshot = SERVER_PWA;
let initialized = false;
let installPrompt: InstallPrompt | null = null;
const listeners = new Set<() => void>();
export const subscribePwa = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getPwaSnapshot = () => snapshot;
export const getServerPwaSnapshot = () => SERVER_PWA;
function update(patch: Partial<Snapshot>) {
  if (Object.entries(patch).every(([key, value]) => snapshot[key as keyof Snapshot] === value))
    return;
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

export function mayRegisterWorker(
  origin: string,
  canonicalOrigin: string,
  release: boolean,
): boolean {
  if (!release) return false;
  try {
    const url = new URL(origin);
    return (
      (url.origin === canonicalOrigin && url.protocol === 'https:') ||
      (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    );
  } catch {
    return false;
  }
}

export function startPwa(canonicalOrigin: string, release: boolean): void {
  if (typeof window === 'undefined' || initialized) return;
  initialized = true;
  const display = window.matchMedia('(display-mode: standalone)');
  const detect = () =>
    update({
      installed:
        display.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    });
  detect();
  update({ ready: true });
  display.addEventListener('change', detect);
  window.addEventListener('pageshow', detect);
  window.addEventListener('beforeinstallprompt', (event) => {
    if (!mayRegisterWorker(window.location.origin, canonicalOrigin, release)) return;
    event.preventDefault();
    installPrompt = event as InstallPrompt;
    update({ canPrompt: true });
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    update({ canPrompt: false });
    detect();
  });
  if (
    !mayRegisterWorker(window.location.origin, canonicalOrigin, release) ||
    !('serviceWorker' in navigator)
  )
    return;
  void navigator.serviceWorker
    .register('/sw.js', { scope: '/', updateViaCache: 'none' })
    .then((registration) => {
      const observe = () => update({ waiting: !!registration.active && !!registration.waiting });
      const observeInstall = () => {
        observe();
        registration.installing?.addEventListener('statechange', observe);
      };
      observeInstall();
      registration.addEventListener('updatefound', observeInstall);
      navigator.serviceWorker.addEventListener('controllerchange', observe);
    })
    .catch(() => update({ workerError: true }));
}

export async function requestInstall(): Promise<
  'accepted' | 'dismissed' | 'instructions' | 'blocked'
> {
  if (isReloadBlocked()) return 'blocked';
  const prompt = installPrompt;
  if (!prompt) return 'instructions';
  installPrompt = null;
  update({ canPrompt: false });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Install prompt timeout')), 30_000);
  });
  try {
    await Promise.race([prompt.prompt(), deadline]);
    return (await Promise.race([prompt.userChoice, deadline])).outcome;
  } catch {
    return 'instructions';
  } finally {
    clearTimeout(timer);
  }
}
