import { loadPinnedCreationProfile } from '@gatopago/shared/v3/initialization';
import {
  parseInitializationPreparation,
  parseInitializationReceipt,
  parseInitializationRestoration,
  type InitializationHistoryItem,
} from '@gatopago/shared/v3/initialization-wire';
import type { CredentialInventory } from '@gatopago/shared/v3/credential-inventory';
import type { CreationConsent } from '@gatopago/shared/v3/creation-operation-wire';
import type { BrowserAuth } from '../auth/browser';
import { holdPageReload } from '../pwa/reload-guard';
import type { CreationProfilePin } from './creation-release';
import type { requestPasskeyProof } from './passkeys';

type Session = Awaited<ReturnType<BrowserAuth['initialization']>>;
type Consent = Awaited<ReturnType<Session['prepare']>>;
type Proof = Awaited<ReturnType<typeof requestPasskeyProof>>;
type Phase =
  | 'idle'
  | 'restoring'
  | 'restore-retry'
  | 'operation-recorded'
  | 'preparing'
  | 'prepare-retry'
  | 'ready'
  | 'proving'
  | 'submitting'
  | 'retry'
  | 'restart'
  | 'done'
  | 'closed';
type Review = Readonly<{
  credentialRef: string;
  network: string;
  generation: number;
  validUntil: number;
  digest: string;
  profileDigest: string;
}>;
type View = Readonly<{
  phase: Phase;
  error: string | null;
  review: Review | null;
  reference: string | null;
  submissionStarted: boolean;
  consent: CreationConsent | null;
}>;
type Attempt = {
  request: {
    request_id: `op_${string}`;
    credential_ref: `op_${string}`;
    user_salt_commitment: `0x${string}`;
  };
  session?: Session;
  consent?: Consent;
  proof?: Proof;
};
const sessionErrors = new Set([
  'auth/session-changed',
  'auth/unauthenticated',
  'client/update-required',
]);
const terminal = new Set([
  'initialization/invalid',
  'initialization/expired',
  'initialization/conflict',
  'initialization/profile-unavailable',
  'invalid-response',
  'expired',
]);
const failure = (code: string) => Object.assign(new Error(code), { code });
const codeOf = (error: unknown) =>
  error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'initialization/unavailable';

export class InitializationFlow {
  private readonly pin: CreationProfilePin;
  private readonly inventory: CredentialInventory;
  private view: View = Object.freeze({
    phase: 'idle',
    error: null,
    review: null,
    reference: null,
    submissionStarted: false,
    consent: null,
  });
  private completedSession: Session | null = null;
  private listeners = new Set<() => void>();
  private attempt: Attempt | null = null;
  private active: AbortController | null = null;
  private expiry: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private readonly captureSession: () => Promise<Session>,
    private readonly prove: typeof requestPasskeyProof,
    pin: CreationProfilePin,
    inventory: CredentialInventory,
  ) {
    this.pin = Object.freeze({ ...pin });
    this.inventory = structuredClone(inventory);
  }
  snapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private set(
    phase: Phase,
    error: string | null = null,
    changes: Partial<Omit<View, 'phase' | 'error'>> = {},
  ) {
    clearTimeout(this.expiry);
    this.view = Object.freeze({ ...this.view, ...changes, phase, error });
    if (phase === 'ready' && this.attempt?.consent) {
      this.expiry = setTimeout(
        () => this.set('restart', 'initialization/expired'),
        Math.max(0, this.attempt.consent.preparation.valid_until * 1000 - Date.now()),
      );
    }
    this.listeners.forEach((listener) => listener());
  }
  checkSession() {
    try {
      this.attempt?.session?.assertCurrent();
      this.completedSession?.assertCurrent();
    } catch {
      this.invalidate();
    }
  }
  invalidate() {
    this.active?.abort();
    this.active = null;
    this.attempt = null;
    this.completedSession = null;
    this.set('closed', 'auth/session-changed', {
      review: null,
      reference: null,
      submissionStarted: false,
      consent: null,
    });
  }
  dispose() {
    this.active?.abort();
    this.active = null;
    this.attempt = null;
    this.completedSession = null;

    this.set(this.view.phase === 'closed' ? 'closed' : 'idle', null, {
      review: null,
      reference: null,
      submissionStarted: false,
      consent: null,
    });
  }
  cancel() {
    if (['closed', 'done', 'operation-recorded'].includes(this.view.phase)) return;
    this.active?.abort();
    this.active = null;

    if (this.attempt?.proof) {
      this.set('retry', 'initialization/result-unknown');
      return;
    }
    this.attempt = null;
    this.set('idle', null, { review: null, reference: null, submissionStarted: false });
  }
  private async run(
    phase: Phase,
    action: (signal: AbortSignal, current: () => void) => Promise<void>,
    fallback: Phase | (() => Phase),
  ) {
    if (this.active || this.view.phase === 'closed') return;
    const controller = new AbortController();
    this.active = controller;
    const current = () => {
      if (this.active !== controller || controller.signal.aborted)
        throw new DOMException('Cancelled', 'AbortError');
      this.attempt?.session?.assertCurrent();
    };
    const release = holdPageReload();
    let abort!: () => void;
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => reject(controller.signal.reason ?? new DOMException('Cancelled', 'AbortError'));
      controller.signal.addEventListener('abort', abort, { once: true });
    });
    const timeout = setTimeout(
      () => controller.abort(failure('initialization/timeout')),
      phase === 'proving' ? 90_000 : 30_000,
    );
    this.set(phase);
    try {
      current();
      await Promise.race([action(controller.signal, current), cancelled]);
    } catch (error) {
      if (this.active === controller) {
        const code = codeOf(error);
        if (sessionErrors.has(code)) {
          this.attempt = null;
          this.completedSession = null;
          this.set('closed', code, {
            review: null,
            reference: null,
            submissionStarted: false,
            consent: null,
          });
        } else
          this.set(
            terminal.has(code) ? 'restart' : typeof fallback === 'function' ? fallback() : fallback,
            code,
          );
      }
    } finally {
      clearTimeout(timeout);
      controller.signal.removeEventListener('abort', abort);
      if (this.active === controller) this.active = null;
      release();
    }
  }
  restore(selected: InitializationHistoryItem) {
    if (!['idle', 'restore-retry'].includes(this.view.phase)) return Promise.resolve();
    const item = Object.freeze({ ...selected });
    return this.run(
      'restoring',
      async (signal, current) => {
        if (!this.inventory.data.some((key) => key.credential_ref === item.credential_ref))
          throw failure('initialization/invalid');
        const session = await this.captureSession();
        current();
        session.assertCurrent();
        const response = await session.restore(item, signal);
        current();
        session.assertCurrent();
        let restored;
        try {
          restored = parseInitializationRestoration(
            {
              preparation: response.consent.preparation,
              user_salt_commitment: response.consent.expected.userSaltCommitment,
              creation_operation_recorded: response.creationOperationRecorded,
            },
            item,
            this.pin,
            this.inventory.scope,
          );
        } catch {
          throw failure('initialization/invalid');
        }
        const { consent } = restored,
          prepared = consent.preparation;
        const profile = loadPinnedCreationProfile(this.pin.document, this.pin.digest);
        const review = Object.freeze({
          credentialRef: item.credential_ref,
          network: profile.deployment.network_id,
          generation: profile.deployment.generation,
          validUntil: prepared.valid_until,
          digest: prepared.approval_digest,
          profileDigest: this.pin.digest,
        });
        this.attempt = null;
        if (prepared.state === 'authorized') {
          this.completedSession = session;
          this.set(restored.creationOperationRecorded ? 'operation-recorded' : 'done', null, {
            review,
            reference: item.initialization_id,
            submissionStarted: true,
            consent,
          });
          return;
        }
        this.attempt = {
          request: {
            request_id: prepared.initialization_id,
            credential_ref: prepared.credential_ref,
            user_salt_commitment: consent.expected.userSaltCommitment,
          },
          session,
          consent,
        };
        this.set('ready', null, {
          review,
          reference: prepared.initialization_id,
          submissionStarted: false,
        });
        if (Date.now() < prepared.valid_after * 1000 || Date.now() >= prepared.valid_until * 1000)
          throw failure('initialization/expired');
      },
      'restore-retry',
    );
  }
  prepare(credentialRef: string) {
    if (!['idle', 'prepare-retry'].includes(this.view.phase)) return Promise.resolve();
    return this.run(
      'preparing',
      async (signal, current) => {
        const credential = this.inventory.data.find((key) => key.credential_ref === credentialRef);
        if (!credential) throw failure('initialization/invalid');
        if (!this.attempt) {
          const salt = crypto.getRandomValues(new Uint8Array(32));
          this.attempt = {
            request: {
              request_id: `op_${crypto.randomUUID()}`,
              credential_ref: credential.credential_ref,
              user_salt_commitment: `0x${Array.from(salt, (byte) => byte.toString(16).padStart(2, '0')).join('')}`,
            },
          };
        }
        const attempt = this.attempt;
        if (attempt.request.credential_ref !== credentialRef)
          throw failure('initialization/conflict');
        if (!attempt.session) {
          const session = await this.captureSession();
          current();
          session.assertCurrent();
          attempt.session = session;
        }
        const response = await attempt.session.prepare({ ...attempt.request }, signal);
        current();

        const expected = Object.freeze({
          id: attempt.request.request_id,
          credentialRef: attempt.request.credential_ref,
          document: this.pin.document,
          profileDigest: this.pin.digest,
          userSaltCommitment: attempt.request.user_salt_commitment,
          scope: Object.freeze({ ...this.inventory.scope }),
        });
        let prepared;
        try {
          prepared = parseInitializationPreparation(response.preparation, expected);
        } catch {
          throw failure('initialization/invalid');
        }
        attempt.consent = Object.freeze({ preparation: prepared, expected });
        const profile = loadPinnedCreationProfile(this.pin.document, this.pin.digest);
        const review = Object.freeze({
          credentialRef,
          network: profile.deployment.network_id,
          generation: profile.deployment.generation,
          validUntil: prepared.valid_until,
          digest: prepared.approval_digest,
          profileDigest: this.pin.digest,
        });
        if (prepared.state === 'authorized') {
          this.completedSession = attempt.session!;
          this.attempt = null;
          this.set('done', null, {
            review,
            reference: prepared.initialization_id,
            submissionStarted: true,
            consent: attempt.consent,
          });
          return;
        }
        if (Date.now() < prepared.valid_after * 1000 || Date.now() >= prepared.valid_until * 1000)
          throw failure('initialization/expired');
        this.set('ready', null, { review, reference: prepared.initialization_id });
      },
      'prepare-retry',
    );
  }
  confirm() {
    if (this.view.phase !== 'ready' || !this.attempt?.consent) return Promise.resolve();
    return this.run(
      'proving',
      async (signal, current) => {
        const attempt = this.attempt!,
          consent = attempt.consent!,
          prepared = consent.preparation;
        if (Date.now() < prepared.valid_after * 1000 || Date.now() >= prepared.valid_until * 1000)
          throw failure('initialization/expired');

        const proof = await this.prove({
          scope: consent.expected.scope,
          key: prepared.public_key,
          challenge: prepared.approval_digest,
          credentialId: prepared.credential_id,
          validUntilMs: prepared.valid_until * 1000,
          signal,
        });
        current();
        attempt.proof = Object.freeze(structuredClone(proof));
        this.set('submitting', null, { submissionStarted: true });
        await this.submit(attempt, signal, current);
      },
      () => (this.attempt?.proof ? 'retry' : 'ready'),
    );
  }
  retry() {
    if (this.view.phase !== 'retry' || !this.attempt?.proof) return Promise.resolve();
    return this.run(
      'submitting',
      (signal, current) => this.submit(this.attempt!, signal, current),
      'retry',
    );
  }
  private async submit(attempt: Attempt, signal: AbortSignal, current: () => void) {
    const result = await attempt.session!.authorize(attempt.consent!, attempt.proof!, signal);
    current();
    let receipt;
    try {
      receipt = parseInitializationReceipt(result, {
        id: attempt.request.request_id,
        profileDigest: this.pin.digest,
        approvalDigest: attempt.consent!.preparation.approval_digest,
      });
    } catch {
      throw failure('initialization/invalid');
    }
    if (receipt.state !== 'authorized') throw failure('initialization/invalid');

    const consent = Object.freeze({
      expected: attempt.consent!.expected,
      preparation: parseInitializationPreparation(
        { ...attempt.consent!.preparation, state: 'authorized' },
        attempt.consent!.expected,
      ),
    });
    this.completedSession = attempt.session!;
    this.attempt = null;
    this.set('done', null, { reference: receipt.initialization_id, consent });
  }
}
