import type { CredentialInventory } from '@gatopago/shared/v3/credential-inventory';
import type { BrowserAuth } from '../auth/browser';

type Session = Pick<ReturnType<BrowserAuth['credentialInventory']>, 'assertCurrent' | 'read'>;
type View =
  | { phase: 'loading' }
  | { phase: 'ready'; inventory: CredentialInventory }
  | { phase: 'error' | 'closed'; code: string };

/** Component-owned read model. No timers/polling, persistence, or WebAuthn calls. */
export class CredentialInventoryStore {
  private view: View = Object.freeze({ phase: 'loading' });
  private readonly listeners = new Set<() => void>();
  private session: Session | null = null;
  private active: AbortController | null = null;
  constructor(private readonly captureSession: () => Session) {}
  snapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private set(view: View) {
    this.view = Object.freeze(view);
    this.listeners.forEach((listener) => listener());
  }
  checkSession() {
    try {
      this.session?.assertCurrent();
    } catch {
      this.invalidate();
    }
  }
  invalidate() {
    this.active?.abort();
    this.active = null;
    this.session = null;
    this.set({ phase: 'closed', code: 'auth/session-changed' });
  }
  cancel() {
    this.active?.abort();
    this.active = null;
    this.session = null;
    if (this.view.phase !== 'closed') this.set({ phase: 'loading' });
  }
  async load() {
    if (this.view.phase === 'closed') return;
    this.active?.abort();
    const controller = new AbortController();
    this.active = controller;
    this.set({ phase: 'loading' }); // Never show an old count while checking a newer registration.
    try {
      const session = this.captureSession();
      this.session = session;
      session.assertCurrent();
      const inventory = await session.read(controller.signal);
      if (controller.signal.aborted || this.active !== controller) return;
      session.assertCurrent();
      this.set({ phase: 'ready', inventory });
    } catch (error) {
      if (controller.signal.aborted || this.active !== controller) return;
      const code =
        error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
          ? error.code
          : 'credentials/unavailable';
      if (code === 'auth/session-changed') this.invalidate();
      else this.set({ phase: 'error', code });
    } finally {
      if (this.active === controller) this.active = null;
    }
  }
}
