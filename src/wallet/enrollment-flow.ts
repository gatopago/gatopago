import type { BrowserAuth } from '../auth/browser';
import type { PreparedEnrollment, EnrollmentSubmission } from './enrollment';
import type { requestPasskeyRegistration, requestPasskeyProof } from './passkeys';
import { holdPageReload } from '../pwa/reload-guard';

type Session = ReturnType<BrowserAuth['enrollment']>;
type Ceremonies = { create: typeof requestPasskeyRegistration; prove: typeof requestPasskeyProof };
type Registered = Awaited<ReturnType<typeof requestPasskeyRegistration>>;
type Phase =
  | 'idle'
  | 'preparing'
  | 'ready'
  | 'creating'
  | 'proof'
  | 'proving'
  | 'submitting'
  | 'retry'
  | 'restart'
  | 'done'
  | 'closed';
export type EnrollmentView = Readonly<{ phase: Phase; error: string | null; keyMayExist: boolean }>;
const terminal = new Set([
  'enrollment/invalid',
  'enrollment/expired',
  'enrollment/conflict',
  'expired',
  'invalid-response',
  'already-registered',
]);
const sessionErrors = new Set([
  'auth/session-changed',
  'auth/unauthenticated',
  'client/update-required',
]);
const errorCode = (error: unknown) =>
  error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'enrollment/unavailable';

export class EnrollmentFlow {
  private view: EnrollmentView = Object.freeze({ phase: 'idle', error: null, keyMayExist: false });
  private listeners = new Set<() => void>();
  private attempt: {
    id: string;
    session: Session;
    prepared?: PreparedEnrollment;
    registered?: Registered;
    submission?: EnrollmentSubmission;
  } | null = null;
  private active: AbortController | null = null;
  private expiry: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private readonly captureSession: () => Session,
    private readonly ceremonies: Ceremonies,
  ) {}
  snapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private set(phase: Phase, error: string | null = null, keyMayExist = this.view.keyMayExist) {
    clearTimeout(this.expiry);
    this.view = Object.freeze({ phase, error, keyMayExist });
    if ((phase === 'ready' || phase === 'proof') && this.attempt?.prepared) {
      this.expiry = setTimeout(
        () => this.set('restart', 'enrollment/expired'),
        Math.max(0, this.attempt.prepared.validUntilMs - Date.now()),
      );
    }
    this.listeners.forEach((listener) => listener());
  }
  checkSession() {
    try {
      this.attempt?.session.assertCurrent();
    } catch {
      this.invalidate();
    }
  }
  invalidate() {
    this.active?.abort();
    this.active = null;
    this.attempt = null;
    this.set('closed', 'auth/session-changed');
  }
  cancel() {
    if (this.view.phase === 'closed') return;
    this.active?.abort();
    this.active = null;
    this.attempt = null;
    this.set('idle');
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
      this.attempt?.session.assertCurrent();
    };
    const release = holdPageReload();
    let abort!: () => void;
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => reject(new DOMException('Cancelled', 'AbortError'));
      controller.signal.addEventListener('abort', abort, { once: true });
    });
    this.set(phase);
    try {
      current();
      await Promise.race([action(controller.signal, current), cancelled]);
    } catch (error) {
      if (this.active === controller && !controller.signal.aborted) {
        const code = errorCode(error);
        if (sessionErrors.has(code)) {
          this.attempt = null;
          this.set('closed', code);
        } else
          this.set(
            terminal.has(code) ? 'restart' : typeof fallback === 'function' ? fallback() : fallback,
            code,
          );
      }
    } finally {
      if (this.active === controller) this.active = null;
      controller.signal.removeEventListener('abort', abort);
      release();
    }
  }
  prepare() {
    if (this.view.phase !== 'idle') return Promise.resolve();
    return this.run(
      'preparing',
      async (signal, current) => {
        if (!this.attempt)
          this.attempt = { id: `op_${crypto.randomUUID()}`, session: this.captureSession() };
        current();
        const result = await this.attempt.session.prepare(this.attempt.id, signal);
        current();
        if (result.kind === 'enrolled') {
          this.attempt = null;
          this.set('done');
          return;
        }
        this.attempt.prepared = result;
        this.set('ready');
      },
      'idle',
    );
  }
  create(preference: 'default' | 'security-key') {
    if (this.view.phase !== 'ready' || !this.attempt?.prepared) return Promise.resolve();
    return this.run(
      'creating',
      async (signal, current) => {
        const attempt = this.attempt!,
          prepared = attempt.prepared!;
        this.set('creating', null, true);

        const registered = await this.ceremonies.create({
          scope: prepared.scope,
          challenge: prepared.challenge,
          userHandle: prepared.userHandle,
          userName: prepared.userName,
          excludeCredentials: prepared.excludeCredentials,
          validUntilMs: prepared.validUntilMs,
          preference,
          signal,
        });
        current();
        attempt.registered = registered;
        this.set('proof');
      },
      'ready',
    );
  }
  prove() {
    if (this.view.phase !== 'proof' || !this.attempt?.registered) return Promise.resolve();
    return this.run(
      'proving',
      async (signal, current) => {
        const attempt = this.attempt!,
          prepared = attempt.prepared!,
          registered = attempt.registered!;
        const proof = await this.ceremonies.prove({
          scope: prepared.scope,
          key: registered.key,
          challenge: prepared.proofChallenge,
          credentialId: registered.registration.credential_id,
          validUntilMs: prepared.validUntilMs,
          signal,
        });
        current();

        attempt.submission = structuredClone({ ...registered.registration, proof });
        this.set('submitting');
        await attempt.session.complete(attempt.id, attempt.submission, signal);
        current();
        this.attempt = null;
        this.set('done');
      },
      () => (this.attempt?.submission ? 'retry' : 'proof'),
    );
  }
  retry() {
    if (this.view.phase !== 'retry') return Promise.resolve();
    if (!this.attempt?.submission) return Promise.resolve();
    return this.run(
      'submitting',
      async (signal, current) => {
        const attempt = this.attempt!;
        await attempt.session.complete(attempt.id, attempt.submission!, signal);
        current();
        this.attempt = null;
        this.set('done');
      },
      'retry',
    );
  }
}
