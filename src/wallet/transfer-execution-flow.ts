import type { TransferRequest } from '@gatopago/shared/v3/transfer';
import type { EnabledAuthConfig } from '../auth/config';
import type { BrowserAuth } from '../auth/browser';
import { holdPageReload } from '../pwa/reload-guard';
import { parseTransferPreparation, type TransferSelection } from './transfer-preparation';
import {
  parseTransferConfirmationReceipt,
  parseTransferDeliveryReceipt,
  type TransferReview,
  type TransferProofs,
} from './transfer-command';
import { parseTransferStatus } from './transfers';

type Confirmation = ReturnType<typeof parseTransferConfirmationReceipt>;
type Delivery = ReturnType<typeof parseTransferDeliveryReceipt>;
type Status = ReturnType<typeof parseTransferStatus>;
type Session = {
  commands: ReturnType<BrowserAuth['transferCommands']>;
  transfers: ReturnType<BrowserAuth['transfers']>;
};
type Phase =
  | 'ready'
  | 'confirming'
  | 'confirmation-uncertain'
  | 'reserved'
  | 'delivering'
  | 'delivery-uncertain'
  | 'accepted'
  | 'observing'
  | 'observed'
  | 'expired'
  | 'closed';
type View = Readonly<{
  phase: Phase;
  confirmation: Confirmation | null;
  delivery: Delivery | null;
  status: Status | null;
  error: boolean;
}>;

export class TransferExecutionFlow {
  private view: View = Object.freeze({
    phase: 'ready',
    confirmation: null,
    delivery: null,
    status: null,
    error: false,
  });
  private readonly selected: TransferSelection;
  private readonly request: TransferRequest;
  private readonly review: TransferReview;
  private readonly initial: ReturnType<typeof parseTransferPreparation>;
  private session: Session | null = null;
  private active: AbortController | null = null;
  private confirmationAttempted = false;
  private deliveryAttempted = false;
  private trackingReadFailed = false;
  private lastSubmittedProofs: TransferProofs | null = null;
  private readonly listeners = new Set<() => void>();
  constructor(
    private readonly capture: () => Session,
    selected: TransferSelection,
    request: TransferRequest,
    review: TransferReview,
    private readonly environment: EnabledAuthConfig['deployment'],
    private readonly beforeConfirm?: () => void,
  ) {
    this.selected = structuredClone(selected);
    this.request = structuredClone(request);
    this.review = structuredClone(review);
    this.initial = this.currentReview();
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
  private currentReview() {
    return parseTransferPreparation(
      this.review.wire,
      this.selected,
      this.request,
      this.environment,
    );
  }
  private currentSession() {
    this.session ??= this.capture();
    this.session.commands.assertCurrent();
    this.session.transfers.assertCurrent();
    return this.session;
  }
  invalidate() {
    this.active?.abort();
    this.active = null;
    this.session = null;
    this.lastSubmittedProofs = null;
    this.set({ phase: 'closed', confirmation: null, delivery: null, status: null, error: false });
  }
  dispose() {
    this.invalidate();
  }
  canEdit() {
    return !this.active && !this.confirmationAttempted && this.view.phase !== 'closed';
  }
  canDeliver() {
    return (
      !this.active &&
      !this.deliveryAttempted &&
      this.view.confirmation?.state === 'held' &&
      (this.view.phase === 'reserved' ||
        (this.view.phase === 'observed' && this.view.status?.status === 'held'))
    );
  }

  canTrack() {
    return (
      !!this.view.confirmation &&
      !this.trackingReadFailed &&
      ['accepted', 'delivery-uncertain', 'observed'].includes(this.view.phase) &&
      !['reconciled', 'expired', 'review_required'].includes(this.view.status?.status ?? '')
    );
  }

  discardUnsubmitted(): boolean {
    if (!this.canEdit()) return false;
    this.invalidate();
    return true;
  }
  private alive(controller: AbortController) {
    return this.active === controller && !controller.signal.aborted;
  }
  private failed(controller: AbortController, phase: Phase) {
    if (!this.alive(controller)) return;
    try {
      this.currentSession();
    } catch {
      this.invalidate();
      return;
    }
    this.set({ phase, error: true });
  }
  async confirm(proofs: TransferProofs) {
    if (this.active || !['ready', 'confirmation-uncertain'].includes(this.view.phase)) return;
    const snapshot = structuredClone(proofs),
      controller = new AbortController();
    this.active = controller;
    const release = holdPageReload();
    try {
      const session = this.currentSession();
      try {
        this.currentReview();
      } catch {
        this.set({ phase: 'expired', error: true });
        return;
      }
      this.beforeConfirm?.();
      this.set({ phase: 'confirming', error: false });
      this.confirmationAttempted = true;
      this.lastSubmittedProofs = snapshot;
      const result = await session.commands.confirm(
        this.selected,
        this.request,
        this.review,
        snapshot,
        controller.signal,
      );
      if (!this.alive(controller)) return;
      this.currentSession();
      const confirmation = parseTransferConfirmationReceipt(result, this.initial);
      this.set({
        phase: confirmation.state === 'held' ? 'reserved' : 'observed',
        confirmation,
        error: false,
      });
    } catch {
      this.failed(controller, this.confirmationAttempted ? 'confirmation-uncertain' : 'ready');
    } finally {
      if (this.active === controller) this.active = null;
      release();
    }
  }
  async deliver() {
    if (!this.canDeliver() || !this.view.confirmation) return;
    const confirmation = this.view.confirmation,
      controller = new AbortController();
    this.active = controller;
    const release = holdPageReload();
    try {
      const session = this.currentSession();
      try {
        this.currentReview();
      } catch {
        this.set({ phase: 'expired', error: true });
        return;
      }
      this.set({ phase: 'delivering', error: false });
      this.deliveryAttempted = true;
      const result = await session.commands.deliver(
        this.selected,
        this.request,
        this.review,
        confirmation,
        controller.signal,
      );
      if (!this.alive(controller)) return;
      this.currentSession();
      const delivery = parseTransferDeliveryReceipt(
        result,
        confirmation.id,
        this.initial.candidate.userOpHash,
      );
      this.set({
        phase: delivery.delivery === 'accepted' ? 'accepted' : 'delivery-uncertain',
        delivery,
        error: false,
      });
    } catch {
      this.failed(controller, 'delivery-uncertain');
    } finally {
      if (this.active === controller) this.active = null;
      release();
    }
  }
  async readStatus() {
    if (this.active || this.view.phase === 'closed') return;
    if (!this.view.confirmation && !this.lastSubmittedProofs) return;
    this.trackingReadFailed = false;
    const controller = new AbortController(),
      previous = this.view.phase;
    this.active = controller;
    this.set({ phase: 'observing', status: null, error: false });
    try {
      const session = this.currentSession();
      let confirmation = this.view.confirmation;
      if (!confirmation && this.lastSubmittedProofs) {
        const result = await session.commands.confirm(
          this.selected,
          this.request,
          this.review,
          this.lastSubmittedProofs,
          controller.signal,
        );
        if (!this.alive(controller)) return;
        this.currentSession();
        confirmation = parseTransferConfirmationReceipt(result, this.initial);
        this.set({ confirmation });
      }
      if (!confirmation) {
        this.failed(controller, previous);
        return;
      }
      const id = confirmation.id;
      const locator = {
        wallet_id: this.selected.wallet_id,
        wallet_account_id: this.selected.wallet_account_id,
        operation_id: id,
        network_id: this.selected.network_id,
      };
      const response = await session.transfers.status(locator, controller.signal);
      if (!this.alive(controller)) return;
      this.currentSession();
      const status = parseTransferStatus(response, locator);
      if (status.userop_hash !== this.initial.candidate.userOpHash)
        throw new Error('Mismatched operation');

      this.set({
        phase: previous === 'reserved' && status.status === 'held' ? 'reserved' : 'observed',
        status,
        confirmation,
        error: false,
      });
    } catch {
      this.trackingReadFailed = true;
      this.failed(controller, previous);
    } finally {
      if (this.active === controller) this.active = null;
    }
  }
}
