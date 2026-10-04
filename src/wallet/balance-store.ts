import type { BrowserAuth } from '../auth/browser';
import type { AccountChoice, AccountPage, BalanceView } from './balances';
import { parseTransferStatus } from './transfers';
import { parseResourceId } from '@gatopago/shared/v3/primitives';

type Session = ReturnType<BrowserAuth['balances']>;
type View = {
  phase: 'idle' | 'loading' | 'ready' | 'error' | 'closed' | 'expired';
  page: AccountPage | null;
  selected: AccountChoice | null;
  balance: BalanceView | null;
  error: string | null;
};

/** Inert constructor, component-local reads, no signing or balance polling. */
export class BalanceStore {
  private view: View = { phase: 'idle', page: null, selected: null, balance: null, error: null };
  private readonly listeners = new Set<() => void>();
  private active: AbortController | null = null;
  private session: Session | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly reconciledReads = new Set<string>();
  constructor(
    private readonly capture: () => Session,
    private readonly walletId: string,
  ) {}
  snapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private set(next: Partial<View>) {
    this.view = { ...this.view, ...next };
    this.listeners.forEach((listener) => listener());
  }
  private cancel() {
    this.active?.abort();
    this.active = null;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
  dispose() {
    this.cancel();
    this.session = null;
    this.reconciledReads.clear();
    this.set({ phase: 'idle', page: null, selected: null, balance: null, error: null });
  }
  invalidate() {
    this.dispose();
    this.set({ phase: 'closed', error: 'auth/session-changed' });
  }
  checkSession() {
    try {
      this.session?.assertCurrent();
    } catch {
      this.invalidate();
    }
  }
  expire() {
    this.checkSession();
    if (
      this.view.balance &&
      (Date.now() / 1000 >= this.view.balance.expires_at ||
        Date.now() / 1000 < this.view.balance.observed_at)
    ) {
      this.cancel();
      this.set({ phase: 'expired', balance: null });
    }
  }
  async open() {
    await this.loadAccountPage(null, true);
  }
  async loadAccounts(after: string | null = null) {
    await this.loadAccountPage(after, false);
  }
  private async loadAccountPage(after: string | null, selectSingle: boolean) {
    if (this.view.phase === 'loading') return;
    await this.run(
      async (session, signal) => {
        const page = await session.accounts(this.walletId, after, signal);
        signal.throwIfAborted();
        session.assertCurrent();
        // Do not infer uniqueness from a partial page. A single complete account
        // can be selected for display only; sending still requires its own checks.
        if (selectSingle && page.next_cursor === null && page.data.length === 1) {
          const selected = page.data[0];
          // The owned account is usable for historical lookup even if its balance
          // RPC fails. Publish no amount or spending permission before that read.
          this.set({ page, selected });
          signal.throwIfAborted();
          session.assertCurrent();
          return { page, selected, balance: await session.read(selected, signal) };
        }
        return { page, selected: null, balance: null };
      },
      { page: null, selected: null },
    );
  }
  async select(id: string) {
    if (this.view.phase === 'closed') return;
    if (this.view.phase === 'loading' && this.view.selected?.id === id) return;
    const selected = this.view.page?.data.find((account) => account.id === id);
    if (!selected) {
      this.cancel();
      this.set({ phase: 'ready', selected: null, balance: null });
      return;
    }
    await this.run(async (session, signal) => ({ balance: await session.read(selected, signal) }), {
      selected,
    });
  }
  async refresh() {
    if (this.view.selected) await this.select(this.view.selected.id);
  }
  /** A parsed, owned terminal status can request one fresh display-only GET.
   * It never changes a reservation, authorizes spending or retries delivery. */
  refreshAfterTransfer = async (input: ReturnType<typeof parseTransferStatus>) => {
    const selected = this.view.selected;
    if (!selected || this.view.phase === 'closed') return;
    let status: ReturnType<typeof parseTransferStatus>;
    try {
      status = parseTransferStatus(input, {
        wallet_id: selected.wallet_id,
        wallet_account_id: selected.id,
        network_id: selected.network_id,
        operation_id: parseResourceId('operation', input.operation_id),
      });
    } catch {
      return;
    }
    if (status.status !== 'reconciled' || this.reconciledReads.has(status.operation_id)) return;
    this.reconciledReads.add(status.operation_id);
    // Replace an in-flight pre-reconciliation read; do not deduplicate against
    // an observation which started before this result was known.
    await this.run(
      async (session, signal) => {
        const balance = await session.read(selected, signal);
        if (balance.observed_at < status.historical_confirmation!.recorded_at)
          throw new Error('Stale post-transfer balance');
        return { balance };
      },
      { selected },
    );
  };
  private async run(
    action: (session: Session, signal: AbortSignal) => Promise<Partial<View>>,
    initial: Partial<View>,
  ) {
    if (this.view.phase === 'closed') return;
    this.cancel();
    const controller = new AbortController();
    this.active = controller;
    this.set({ ...initial, phase: 'loading', balance: null, error: null });
    try {
      const session = this.session ?? this.capture();
      this.session = session;
      session.assertCurrent();
      const next = await action(session, controller.signal);
      if (controller.signal.aborted || this.active !== controller) return;
      session.assertCurrent();
      this.set({ ...next, phase: 'ready' });
      this.expire();
      if (this.view.balance) {
        this.timer = setTimeout(
          () => this.expire(),
          Math.max(0, this.view.balance.expires_at * 1000 - Date.now()),
        );
      }
    } catch (error) {
      if (controller.signal.aborted || this.active !== controller) return;
      const code =
        error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
          ? error.code
          : 'wallet/unavailable';
      if (code === 'auth/session-changed' || code === 'auth/unauthenticated') this.invalidate();
      else this.set({ phase: 'error', balance: null, error: code });
    } finally {
      if (this.active === controller) this.active = null;
    }
  }
}
