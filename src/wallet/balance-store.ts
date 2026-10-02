import type { BrowserAuth } from '../auth/browser';
import type { AccountChoice, AccountPage, BalanceView } from './balances';

type Session = ReturnType<BrowserAuth['balances']>;
type View = { phase: 'idle' | 'loading' | 'ready' | 'error' | 'closed' | 'expired'; page: AccountPage | null;
  selected: AccountChoice | null; balance: BalanceView | null; error: string | null };

/** Inert constructor, component-local state, explicit reads, no balance polling. */
export class BalanceStore {
  private view: View = { phase: 'idle', page: null, selected: null, balance: null, error: null };
  private readonly listeners = new Set<() => void>();
  private active: AbortController | null = null;
  private session: Session | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private readonly capture: () => Session, private readonly walletId: string) {}
  snapshot = () => this.view;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private set(next: Partial<View>) { this.view = { ...this.view, ...next }; this.listeners.forEach((listener) => listener()); }
  private cancel() { this.active?.abort(); this.active = null; if (this.timer !== null) clearTimeout(this.timer); this.timer = null; }
  dispose() { this.cancel(); this.session = null; this.set({ phase: 'idle', page: null, selected: null, balance: null, error: null }); }
  invalidate() { this.dispose(); this.set({ phase: 'closed', error: 'auth/session-changed' }); }
  checkSession() { try { this.session?.assertCurrent(); } catch { this.invalidate(); } }
  expire() {
    this.checkSession();
    if (this.view.balance && (Date.now() / 1000 >= this.view.balance.expires_at || Date.now() / 1000 < this.view.balance.observed_at)) {
      this.cancel(); this.set({ phase: 'expired', balance: null });
    }
  }
  async loadAccounts(after: string | null = null) {
    if (this.view.phase === 'loading') return;
    await this.run(async (session, signal) => {
      const page = await session.accounts(this.walletId, after, signal);
      return { page, selected: null, balance: null };
    }, { page: null, selected: null });
  }
  async select(id: string) {
    if (this.view.phase === 'closed') return;
    if (this.view.phase === 'loading' && this.view.selected?.id === id) return;
    const selected = this.view.page?.data.find((account) => account.id === id);
    if (!selected) { this.cancel(); this.set({ phase: 'ready', selected: null, balance: null }); return; }
    await this.run(async (session, signal) => ({ balance: await session.read(selected, signal) }), { selected });
  }
  async refresh() { if (this.view.selected) await this.select(this.view.selected.id); }
  private async run(action: (session: Session, signal: AbortSignal) => Promise<Partial<View>>, initial: Partial<View>) {
    if (this.view.phase === 'closed') return;
    this.cancel(); const controller = new AbortController(); this.active = controller;
    this.set({ ...initial, phase: 'loading', balance: null, error: null });
    try {
      const session = this.session ?? this.capture(); this.session = session; session.assertCurrent();
      const next = await action(session, controller.signal);
      if (controller.signal.aborted || this.active !== controller) return;
      session.assertCurrent(); this.set({ ...next, phase: 'ready' }); this.expire();
      if (this.view.balance) {
        this.timer = setTimeout(() => this.expire(), Math.max(0, this.view.balance.expires_at * 1000 - Date.now()));
      }
    } catch (error) {
      if (controller.signal.aborted || this.active !== controller) return;
      const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'wallet/unavailable';
      if (code === 'auth/session-changed' || code === 'auth/unauthenticated') this.invalidate();
      else this.set({ phase: 'error', balance: null, error: code });
    } finally { if (this.active === controller) this.active = null; }
  }
}
