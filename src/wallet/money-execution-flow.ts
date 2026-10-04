import type { BrowserAuth } from '../auth/browser';
import type { MoneyProof } from '@gatopago/shared/v3/money-review-record';
import { createResourceId } from '@gatopago/shared/v3/primitives';
import { holdPageReload } from '../pwa/reload-guard';
import {
  parseMoneyPreparation,
  parseMoneyPreparationHistory,
  type MoneyPreparation,
  type parseMoneyStatus,
} from './money';
import type { MoneySelection } from './money-release';
import type { MoneyBookmark } from './money-bookmark';

type Session = Awaited<ReturnType<BrowserAuth['money']>>;
type Status = ReturnType<typeof parseMoneyStatus>;
type Phase =
  | 'review'
  | 'confirming'
  | 'confirmation-uncertain'
  | 'authorized'
  | 'delivering'
  | 'delivery-uncertain'
  | 'observing'
  | 'observed'
  | 'expired'
  | 'closed';
type View = Readonly<{
  phase: Phase;
  operation_id: string | null;
  status: Status | null;
  error: boolean;
}>;

export class MoneyExecutionFlow {
  private view: View;
  private active: AbortController | null = null;
  private confirmationAttempted: boolean;
  private deliveryAttempted = false;
  private readonly confirmationKey = createResourceId('operation');
  private readonly initial: MoneyPreparation;
  private readonly selected: MoneySelection;
  private readonly consentExpiresAt: number;
  private readonly listeners = new Set<() => void>();
  constructor(
    private readonly session: Session,
    selected: MoneySelection,
    preparation: MoneyPreparation,
    private readonly persist: (bookmark: MoneyBookmark) => void,
    restored = false,
    consentExpiresAt = preparation.expires_at,
  ) {
    this.selected = structuredClone(selected);
    this.initial = parseMoneyPreparationHistory(
      preparation.wire,
      this.selected,
      session.environment,
      preparation.preparation_id,
    );
    if (!Number.isSafeInteger(consentExpiresAt) || consentExpiresAt <= 0)
      throw new Error('MONEY_CONSENT_EXPIRY_INVALID');
    this.consentExpiresAt = Math.min(this.initial.expires_at, consentExpiresAt);
    this.confirmationAttempted = restored || this.initial.operation_id !== null;
    this.view = Object.freeze({
      phase: this.confirmationAttempted ? 'confirmation-uncertain' : 'review',
      operation_id: this.initial.operation_id,
      status: null,
      error: false,
    });
  }
  snapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private set(changes: Partial<View>) {
    this.view = Object.freeze({ ...this.view, ...changes });
    this.listeners.forEach((listener) => listener());
  }
  private live() {
    if (this.view.phase === 'closed') throw new Error('MONEY_FLOW_CLOSED');
    this.session.assertCurrent();
  }
  private fresh() {
    this.live();
    if (Date.now() >= this.consentExpiresAt * 1000) throw new Error('MONEY_CONSENT_EXPIRED');
    return parseMoneyPreparation(
      this.initial.wire,
      this.selected,
      this.initial.candidate.request,
      this.session.environment,
    );
  }
  bookmark(): MoneyBookmark {
    return {
      schema_version: 1,
      wallet_id: this.selected.wallet_id,
      wallet_account_id: this.selected.wallet_account_id,
      network_id: 'eip155:421614',
      preparation_id: this.initial.preparation_id,
      operation_id: this.view.operation_id,
    };
  }
  canEdit() {
    return !this.active && !this.confirmationAttempted && this.view.phase !== 'closed';
  }
  canDeliver() {
    return !this.active && !this.deliveryAttempted && this.view.phase === 'authorized';
  }
  canTrack() {
    return (
      !!this.view.operation_id &&
      !['review', 'authorized', 'expired', 'closed'].includes(this.view.phase) &&
      !['reconciled', 'reverted_confirmed', 'expired_unsubmitted', 'review_required'].includes(
        this.view.status?.state ?? '',
      )
    );
  }
  invalidate() {
    this.active?.abort();
    this.active = null;
    this.set({ phase: 'closed', operation_id: null, status: null, error: false });
  }
  private alive(controller: AbortController) {
    return this.active === controller && !controller.signal.aborted && this.view.phase !== 'closed';
  }
  private fail(controller: AbortController, phase: Phase) {
    if (!this.alive(controller)) return;
    try {
      this.live();
      this.set({ phase, error: true });
    } catch {
      this.invalidate();
    }
  }
  async confirm(input: readonly MoneyProof[]) {
    if (this.active || this.view.phase !== 'review') return;
    const controller = new AbortController();
    this.active = controller;
    const release = holdPageReload();
    try {
      this.fresh();
      this.persist(this.bookmark());
      this.confirmationAttempted = true;
      this.set({ phase: 'confirming', error: false });
      const result = await this.session.confirm(
        this.selected,
        this.initial,
        structuredClone(input),
        this.confirmationKey,
        controller.signal,
        this.consentExpiresAt,
      );
      if (!this.alive(controller)) return;
      this.live();
      if (
        result.preparation_id !== this.initial.preparation_id ||
        result.consent_digest !== this.initial.candidate.digest
      )
        throw new Error('MONEY_CONFIRMATION_MISMATCH');
      this.set({ operation_id: result.id });
      this.persist(this.bookmark());
      this.set({ phase: result.state === 'authorized' ? 'authorized' : 'observed', error: false });
    } catch {
      this.fail(controller, this.confirmationAttempted ? 'confirmation-uncertain' : 'review');
    } finally {
      if (this.active === controller) this.active = null;
      release();
    }
  }
  async deliver() {
    if (!this.canDeliver() || !this.view.operation_id) return;
    const id = this.view.operation_id,
      controller = new AbortController();
    this.active = controller;
    const release = holdPageReload();
    try {
      this.fresh();
      this.persist(this.bookmark());
      this.deliveryAttempted = true;
      this.set({ phase: 'delivering', error: false });
      const result = await this.session.deliver(
        this.selected,
        this.initial,
        id,
        controller.signal,
        this.consentExpiresAt,
      );
      if (!this.alive(controller)) return;
      this.live();
      this.set({
        phase: result.delivery === 'uncertain' ? 'delivery-uncertain' : 'observed',
        error: false,
      });
    } catch {
      this.fail(controller, this.deliveryAttempted ? 'delivery-uncertain' : 'expired');
    } finally {
      if (this.active === controller) this.active = null;
      release();
    }
  }
  async readStatus() {
    if (this.active || this.view.phase === 'closed' || !this.confirmationAttempted) return;
    const controller = new AbortController(),
      previous = this.view.phase;
    this.active = controller;
    this.set({ phase: 'observing', error: false });
    try {
      this.live();
      let id = this.view.operation_id;
      if (!id) {
        const restored = await this.session.restorePreparation(
          this.selected,
          this.initial.preparation_id,
          controller.signal,
        );
        if (!this.alive(controller)) return;
        this.live();
        if (
          restored.candidate.digest !== this.initial.candidate.digest ||
          restored.preparation_id !== this.initial.preparation_id
        )
          throw new Error('MONEY_RESTORATION_MISMATCH');
        id = restored.operation_id;
        if (!id) {
          this.set({ phase: 'confirmation-uncertain', error: true });
          return;
        }
        this.set({ operation_id: id });
        this.persist(this.bookmark());
      }
      const status = await this.session.status(this.selected, id, controller.signal);
      if (!this.alive(controller)) return;
      this.live();
      if (
        status.operation_id !== id ||
        status.preparation_id !== this.initial.preparation_id ||
        status.candidate.digest !== this.initial.candidate.digest
      )
        throw new Error('MONEY_STATUS_MISMATCH');

      let phase: Phase = 'observed';
      if (status.state === 'authorized' && !this.deliveryAttempted) {
        try {
          this.fresh();
          phase = 'authorized';
        } catch {
          phase = 'expired';
        }
      }
      this.set({ phase, operation_id: id, status, error: false });
    } catch {
      this.fail(controller, previous);
    } finally {
      if (this.active === controller) this.active = null;
    }
  }
}
