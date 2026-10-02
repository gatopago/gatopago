import { parseInitializationCursor, parseInitializationHistory } from '@gatopago/shared/v3/initialization-wire';
import type { BrowserAuth } from '../auth/browser';
import type { InitializationHistoryItem } from '@gatopago/shared/v3/initialization-wire';

type Session = Awaited<ReturnType<BrowserAuth['initialization']>>;
type History = ReturnType<typeof parseInitializationHistory>;
type View = { phase: 'loading' } | { phase: 'ready'; history: History; canStart: boolean } |
  { phase: 'error' | 'closed'; code: string };

/** Selects a screen to review; never prepares or authorizes an operation. */
export function initialSetupChoice(history: History, canStart: boolean, digest: string, credentials: readonly string[]): InitializationHistoryItem | 'new' | null {
  if (canStart) return 'new';
  if (history.next_cursor) return null;
  const candidates = history.data.filter(item => item.state !== 'expired' || item.creation_operation_recorded);
  const request = candidates.length === 1 ? candidates[0] : null;
  return request?.profile_sha256 === digest && credentials.includes(request.credential_ref) ? request : null;
}

/** Bounded, component-owned discovery. No signatures, storage or automatic polling.
 * New setup is offered only after all pages checked in this traversal are expired
 * and unsigned. This is UX coordination, NOT server authorization or an account lock.
 */
export class InitializationHistoryStore {
  private view: View = Object.freeze({ phase: 'loading' });
  private listeners = new Set<() => void>();
  private active: AbortController | null = null;
  private session: Session | null = null;
  private blockingSeen = false;
  private retryCursor: string | null = null;
  constructor(private readonly capture: () => Promise<Session>) {}
  snapshot = () => this.view;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private set(view: View) { this.view = Object.freeze(view); this.listeners.forEach((listener) => listener()); }
  checkSession() { try { this.session?.assertCurrent(); } catch { this.invalidate(); } }
  invalidate() {
    this.active?.abort(); this.active = null; this.session = null;
    this.set({ phase: 'closed', code: 'auth/session-changed' });
  }
  cancel() {
    this.active?.abort(); this.active = null; this.session = null;
    if (this.view.phase !== 'closed') this.set({ phase: 'loading' });
  }
  refresh() { this.blockingSeen = false; return this.load(null); }
  next() {
    return this.view.phase === 'ready' && this.view.history.next_cursor ? this.load(this.view.history.next_cursor) : Promise.resolve();
  }
  retry() { return this.view.phase === 'error' ? this.load(this.retryCursor) : Promise.resolve(); }
  private async load(after: string | null) {
    if (this.view.phase === 'closed') return;
    this.active?.abort(); this.session = null;
    const controller = new AbortController(); this.active = controller; this.retryCursor = after;
    const current = () => {
      controller.signal.throwIfAborted();
      if (this.active !== controller) throw new DOMException('Cancelled', 'AbortError');
      this.session?.assertCurrent();
    };
    const timeout = setTimeout(() => controller.abort(), 20_000);
    let abort!: () => void;
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', abort, { once: true });
    });
    this.set({ phase: 'loading' });
    try {
      await Promise.race([(async () => {
        const session = await this.capture(); current(); session.assertCurrent(); this.session = session;
        const response = await session.history(after, controller.signal); current();
        const history = parseInitializationHistory(response), cursor = after === null ? null : parseInitializationCursor(after);
        if (cursor && history.data.some((row) => row.created_at > cursor.createdAt ||
          (row.created_at === cursor.createdAt && row.initialization_id >= cursor.id))) throw new Error('Non advancing history');
        this.blockingSeen ||= history.data.some((row) => row.state !== 'expired' || row.creation_operation_recorded);
        this.set({ phase: 'ready', history, canStart: !this.blockingSeen && history.next_cursor === null });
      })(), cancelled]);
    } catch (error) {
      if (this.active !== controller) return;
      const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'initialization/unavailable';
      if (code === 'auth/session-changed' || code === 'auth/unauthenticated' || code === 'client/update-required') {
        this.session = null; this.set({ phase: 'closed', code });
      } else this.set({ phase: 'error', code });
    } finally {
      clearTimeout(timeout); controller.signal.removeEventListener('abort', abort);
      if (this.active === controller) this.active = null;
    }
  }
}
