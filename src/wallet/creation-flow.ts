import { loadPinnedCreationProfile } from '@gatopago/shared/v3/initialization';
import {
  parseInitializationPreparation,
  parseInitializationProof,
} from '@gatopago/shared/v3/initialization-wire';
import {
  parseCreationPreview,
  parseCreationReceipt,
  type CreationConsent,
} from '@gatopago/shared/v3/creation-operation-wire';
import { encodeWebAuthnAssertion } from '@gatopago/shared/v3/webauthn';
import type { BrowserAuth } from '../auth/browser';
import { holdPageReload } from '../pwa/reload-guard';
import { creationFeeUnit, parseCreationFee } from './creation-fee';
import type { CreationProfilePin } from './creation-release';
import type { requestPasskeyProof } from './passkeys';

type Session = Awaited<ReturnType<BrowserAuth['creationOperation']>>;
type Proof = Awaited<ReturnType<typeof requestPasskeyProof>>;
type Receipt = ReturnType<typeof parseCreationReceipt>;
type Review = Readonly<{
  network: string;
  address: string;
  cap: bigint;
  maximumCharge: bigint;
  sponsored: boolean;
  digest: string;
  userOpHash: string;
  expiresAt: number;
}>;
type Phase =
  | 'idle'
  | 'loading'
  | 'absent'
  | 'prepare-retry'
  | 'preparing'
  | 'ready'
  | 'proving'
  | 'submitting'
  | 'uncertain'
  | 'authorized'
  | 'expired'
  | 'closed';
type Lifecycle = ReturnType<typeof parseCreationPreview>['lifecycle'];
type View = Readonly<{
  phase: Phase;
  error: string | null;
  review: Review | null;
  receipt: Receipt | null;
  lifecycle: Lifecycle | null;
  checkedAt: number | null;
  signed: boolean;
  cap: string | null;
  network: string;
}>;
const failure = (code: string) => Object.assign(new Error(code), { code });
const codeOf = (e: unknown) =>
  e && typeof e === 'object' && 'code' in e && typeof e.code === 'string'
    ? e.code
    : 'creation/unavailable';
const sessionErrors = new Set([
  'auth/session-changed',
  'auth/unauthenticated',
  'client/update-required',
]);

/** Component-owned operation. Reading never prepares/signs/sends; a signature is
 * requested only from confirm(), synchronously in the user's activation. No
 * storage, polling, account funding, automatic retry or replacement operation.
 */
export class CreationFlow {
  private readonly consent: CreationConsent;
  private view: View;
  private session: Session | null = null;
  private operation: { wire: unknown; preview: ReturnType<typeof parseCreationPreview> } | null =
    null;
  private proof: Proof | null = null;
  private preparationAttempted = false;
  private active: AbortController | null = null;
  private expiry: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<() => void>();
  constructor(
    private readonly captureSession: () => Promise<Session>,
    private readonly prove: typeof requestPasskeyProof,
    pin: CreationProfilePin,
    consent: CreationConsent,
    private readonly knownRecorded = false,
  ) {
    const expected = Object.freeze({
      ...consent.expected,
      scope: Object.freeze({ ...consent.expected.scope }),
    });
    if (expected.document !== pin.document || expected.profileDigest !== pin.digest)
      throw failure('creation/invalid');
    const preparation = parseInitializationPreparation(
      structuredClone(consent.preparation),
      expected,
    );
    if (preparation.state !== 'authorized') throw failure('creation/invalid');
    this.consent = Object.freeze({ preparation, expected });
    const profile = loadPinnedCreationProfile(pin.document, pin.digest);
    this.view = Object.freeze({
      phase: 'idle',
      error: null,
      review: null,
      receipt: null,
      lifecycle: null,
      checkedAt: null,
      signed: false,
      cap: null,
      network: profile.deployment.network_id,
    });
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
    if (['ready', 'absent', 'prepare-retry'].includes(phase)) {
      this.expiry = setTimeout(
        () => this.set('expired', 'creation/expired'),
        Math.max(0, this.consent.preparation.valid_until * 1000 - Date.now()),
      );
    }
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
    this.operation = null;
    this.proof = null;
    this.set('closed', 'auth/session-changed', {
      review: null,
      receipt: null,
      lifecycle: null,
      checkedAt: null,
      cap: null,
      signed: false,
    });
  }
  dispose() {
    this.active?.abort();
    this.active = null;
    this.session = null;
    this.operation = null;
    this.proof = null;
    this.set(this.view.phase === 'closed' ? 'closed' : 'idle', null, {
      review: null,
      receipt: null,
      lifecycle: null,
      checkedAt: null,
      cap: null,
      signed: false,
    });
  }
  stop() {
    if (!this.active) return;
    this.active.abort();
    this.active = null;
    this.set('uncertain', 'creation/result-unknown');
  }
  private live() {
    const p = this.consent.preparation;
    if (
      Date.now() < p.valid_after * 1000 ||
      Date.now() >= p.valid_until * 1000 ||
      this.view.receipt?.authorization_expired
    )
      throw failure('creation/expired');
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
      this.session?.assertCurrent();
    };
    const release = holdPageReload();
    let abort!: () => void;
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => reject(controller.signal.reason ?? new DOMException('Cancelled', 'AbortError'));
      controller.signal.addEventListener('abort', abort, { once: true });
    });
    const timeout = setTimeout(
      () => controller.abort(failure('creation/timeout')),
      phase === 'proving' ? 90_000 : 30_000,
    );
    this.set(phase);
    // Attach the cancellation race even if the initial session assertion throws.
    // The async body still runs synchronously through the WebAuthn invocation.
    try {
      await Promise.race([
        (async () => {
          current();
          await action(controller.signal, current);
        })(),
        cancelled,
      ]);
    } catch (e) {
      if (this.active === controller) {
        const code = codeOf(e);
        if (sessionErrors.has(code)) {
          this.invalidate();
          this.set('closed', code);
        } else
          this.set(
            code === 'creation/expired'
              ? 'expired'
              : typeof fallback === 'function'
                ? fallback()
                : fallback,
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
  private async sessionFor(current: () => void) {
    if (!this.session) {
      const session = await this.captureSession();
      current();
      session.assertCurrent();
      this.session = session;
    }
    return this.session;
  }
  private accept(value: { wire: unknown }, expectedCap?: string) {
    let wire: unknown, preview: ReturnType<typeof parseCreationPreview>;
    try {
      wire = structuredClone(value.wire);
      preview = parseCreationPreview(wire, this.consent);
    } catch {
      throw failure('creation/invalid');
    }
    const approvedCap = expectedCap ?? this.view.cap;
    if (
      (approvedCap !== null && preview.terms.maximumGasCharge.toString() !== approvedCap) ||
      (this.operation && this.operation.preview.candidate.digest !== preview.candidate.digest) ||
      (this.view.receipt?.state === 'authorized' && preview.receipt.state !== 'authorized')
    )
      throw failure('creation/conflict');
    const previous = this.view.lifecycle,
      latest = preview.lifecycle;
    if (
      (this.view.checkedAt !== null && preview.observedAt < this.view.checkedAt) ||
      (previous?.bootstrap &&
        JSON.stringify(previous.bootstrap) !== JSON.stringify(latest.bootstrap)) ||
      (previous?.observation &&
        (!latest.observation ||
          latest.observation.epoch < previous.observation.epoch ||
          (latest.observation.epoch === previous.observation.epoch &&
            JSON.stringify(latest.observation) !== JSON.stringify(previous.observation))))
    ) {
      throw failure('creation/conflict');
    }
    this.operation = { wire, preview };
    const { candidate, receipt, terms } = preview;
    if (receipt.state === 'authorized') this.proof = null;
    const review = Object.freeze({
      network: this.view.network,
      address: candidate.prepared.account,
      cap: terms.maximumGasCharge,
      maximumCharge: candidate.maximumEntryPointCharge,
      sponsored: !!terms.sponsorship,
      digest: candidate.digest,
      userOpHash: candidate.userOpHash,
      expiresAt: receipt.expires_at,
    });
    const expired =
      receipt.authorization_expired ||
      Date.now() >= receipt.expires_at * 1000 ||
      Date.now() < this.consent.preparation.valid_after * 1000;
    this.set(receipt.state === 'authorized' ? 'authorized' : expired ? 'expired' : 'ready', null, {
      review,
      receipt,
      lifecycle: latest,
      checkedAt: preview.observedAt,
      cap: terms.maximumGasCharge.toString(),
      signed: this.proof !== null,
    });
  }
  restore() {
    return this.run(
      'loading',
      async (signal, current) => {
        const session = await this.sessionFor(current);
        current();
        let response;
        try {
          response = await session.restore(this.consent, signal);
          current();
        } catch (e) {
          current();
          if (
            codeOf(e) !== 'creation/not-found' ||
            this.knownRecorded ||
            this.operation ||
            this.proof
          )
            throw e;
          this.live();
          this.set(this.preparationAttempted ? 'prepare-retry' : 'absent');
          return;
        }
        this.accept(response);
      },
      'uncertain',
    );
  }
  /** Entry to the already-consented account. Restore first, then obtain fees
   * only when the same request is confirmed absent. Never signs or delivers. */
  async open() {
    await this.restore();
    if (this.view.phase === 'absent' && !this.knownRecorded) await this.prepare();
  }
  prepare(decimalCap?: string) {
    if (!['absent', 'prepare-retry'].includes(this.view.phase)) return Promise.resolve();
    let cap: string | null;
    try {
      cap =
        this.view.cap ??
        (decimalCap === undefined ? null : parseCreationFee(decimalCap, this.view.network));
    } catch {
      this.set(this.view.phase, 'creation/invalid-cap');
      return Promise.resolve();
    }
    return this.run(
      'preparing',
      async (signal, current) => {
        this.live();
        if (!creationFeeUnit(this.view.network)) throw failure('creation/unsupported-network');
        this.set('preparing', null, { cap });
        const session = await this.sessionFor(current);
        current();
        let response;
        this.preparationAttempted = true;
        try {
          response = await session.prepare(this.consent, cap, signal);
          current();
        } catch (e) {
          current();
          if (codeOf(e) === 'creation/cap-too-low') {
            this.preparationAttempted = false;
            this.set('absent', 'creation/cap-too-low', { cap: null });
            return;
          }
          throw e;
        }
        this.accept(response, cap ?? undefined);
      },
      'uncertain',
    );
  }
  confirm() {
    if (this.view.phase !== 'ready' || !this.operation || !this.session || this.proof)
      return Promise.resolve();
    return this.run(
      'proving',
      async (signal, current) => {
        this.live();
        if (!creationFeeUnit(this.view.network)) throw failure('creation/unsupported-network');
        const p = this.consent.preparation,
          preview = parseCreationPreview(this.operation!.wire, this.consent);
        // Preserve Safari user activation: no token, import, fetch or await before get().
        const proof = await this.prove({
          scope: this.consent.expected.scope,
          key: p.public_key,
          challenge: preview.candidate.digest,
          credentialId: p.credential_id,
          validUntilMs: p.valid_until * 1000,
          signal,
        });
        current();
        this.live();
        encodeWebAuthnAssertion({
          scope: this.consent.expected.scope,
          key: p.public_key,
          challenge: preview.candidate.digest,
          response: parseInitializationProof(proof),
        });
        this.proof = Object.freeze(structuredClone(proof));
        this.set('submitting', null, { signed: true });
        await this.submit(signal, current);
      },
      () => (this.proof ? 'uncertain' : 'ready'),
    );
  }
  retryAuthorization() {
    if (this.view.phase !== 'ready' || !this.operation || !this.proof) return Promise.resolve();
    return this.run(
      'submitting',
      (signal, current) => {
        this.live();
        return this.submit(signal, current);
      },
      'uncertain',
    );
  }
  private async submit(signal: AbortSignal, current: () => void) {
    const result = await this.session!.authorize(
      this.consent,
      this.operation!,
      this.proof!,
      signal,
    );
    current();
    const candidate = this.operation!.preview.candidate;
    let receipt;
    try {
      receipt = parseCreationReceipt(result, {
        id: this.consent.preparation.initialization_id,
        userOpHash: candidate.userOpHash,
        digest: candidate.digest,
        expiresAt: this.consent.preparation.valid_until,
      });
    } catch {
      throw failure('creation/invalid');
    }
    if (receipt.state !== 'authorized') throw failure('creation/invalid');
    this.proof = null;
    this.set('authorized', null, { receipt, signed: false, lifecycle: null, checkedAt: null });
  }
}
