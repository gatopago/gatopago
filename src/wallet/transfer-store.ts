import type { BrowserAuth } from '../auth/browser';
import type { TransferLocator, parseTransferStatus } from './transfers';

type Session = ReturnType<BrowserAuth['transfers']>;
type View = {
  phase: 'idle' | 'loading' | 'ready' | 'error' | 'closed';
  result: ReturnType<typeof parseTransferStatus> | null;
};

/** Instance-local, explicit reads. Late results cannot restore cleared identity/selection. */
export class TransferStore {
  private view: View = { phase: 'idle', result: null };
  private active: AbortController | null = null;
  private readonly listeners = new Set<() => void>();
  constructor(private readonly capture: () => Session) {}
  snapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private set(view: View) {
    this.view = view;
    this.listeners.forEach((listener) => listener());
  }
  clear() {
    this.active?.abort();
    this.active = null;
    if (this.view.phase !== 'closed') this.set({ phase: 'idle', result: null });
  }
  invalidate() {
    this.clear();
    this.set({ phase: 'closed', result: null });
  }
  dispose() {
    this.clear();
  }
  async read(locator: TransferLocator) {
    if (this.view.phase === 'closed' || this.view.phase === 'loading') return;
    const expected = { ...locator },
      controller = new AbortController();
    this.active = controller;
    this.set({ phase: 'loading', result: null });
    try {
      const session = this.capture();
      session.assertCurrent();
      const result = await session.status(expected, controller.signal);
      if (controller.signal.aborted || this.active !== controller) return;
      session.assertCurrent();
      this.set({ phase: 'ready', result });
    } catch {
      if (!controller.signal.aborted && this.active === controller)
        this.set({ phase: 'error', result: null });
    } finally {
      if (this.active === controller) this.active = null;
    }
  }
}
