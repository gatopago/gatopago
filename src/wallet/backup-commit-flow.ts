import { parseBackupPreview, parseBackupSelection, parseBackupCommitPreview, parseBackupCommitReceipt,
  type BackupSelection } from '@gatopago/shared/v3/backup-wire';
import { createResourceId, parseResourceId } from '@gatopago/shared/v3/primitives';
import { parseInitializationProof } from '@gatopago/shared/v3/initialization-wire';
import { encodeWebAuthnAssertion, type WebAuthnAssertionBytes } from '@gatopago/shared/v3/webauthn';
import type { BrowserAuth } from '../auth/browser';
import type { requestPasskeyProof } from './passkeys';
import { holdPageReload } from '../pwa/reload-guard';

type Session = Awaited<ReturnType<BrowserAuth['backup']>>;
type Preview = ReturnType<typeof parseBackupCommitPreview>;
type Phase = 'idle' | 'loading' | 'tracking' | 'absent' | 'ready' | 'proving' | 'submitting' | 'uncertain' | 'authorized' | 'expired' | 'closed';
type View = Readonly<{ phase: Phase; error: string | null; commitId: string | null; proofReady: boolean;
  progress: Awaited<ReturnType<Session['status']>> | null;
  submitted: boolean; review: Readonly<{ digest: string; account: string; network: string; validUntil: number }> | null }>;
const error = (code: string) => Object.assign(new Error(code), { code });

/** An explicit second consent, not evidence of settlement. No work on construction,
 * no automatic retries, and no reuse of the first proposal signature. */
export class BackupCommitFlow {
  private readonly choice: BackupSelection;
  private readonly parent: { wire: unknown };
  private session: Session | null = null;
  private operation: { wire: unknown; preview: Preview } | null = null;
  private proof: WebAuthnAssertionBytes | null = null;
  private active: AbortController | null = null;
  private expiry: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<() => void>();
  private view: View = Object.freeze({ phase: 'idle', error: null, commitId: null, proofReady: false, submitted: false, review: null, progress: null });
  constructor(private readonly capture: () => Promise<Session>, private readonly prove: typeof requestPasskeyProof,
    context: { choice: BackupSelection; parent: { wire: unknown } }) {
    this.choice = parseBackupSelection(structuredClone(context.choice));
    this.parent = structuredClone(context.parent);
    if (parseBackupPreview(this.parent.wire, this.choice).receipt.state !== 'authorized') throw error('backup/invalid');
  }
  snapshot = () => this.view;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private set(phase: Phase, changes: Partial<Omit<View, 'phase'>> = {}) {
    clearTimeout(this.expiry);
    this.view = Object.freeze({ ...this.view, error: null, ...changes, phase });
    if (phase === 'ready' && this.operation) this.expiry = setTimeout(() => this.expire(),
      Math.max(0, this.operation.preview.receipt.valid_until * 1000 - Date.now()));
    this.listeners.forEach((listener) => listener());
  }
  private expire() {
    if (this.view.submitted) this.set('uncertain', { error: 'backup/result-unknown' });
    else { this.proof = null; this.set('expired', { error: 'backup/expired', proofReady: false }); }
  }
  private live() {
    const r = this.operation?.preview.receipt, now = Date.now() / 1000;
    if (!r || r.state !== 'prepared' || now < r.valid_after || now >= r.valid_until) throw error('backup/expired');
  }
  checkSession() { try { this.session?.assertCurrent(); } catch { this.invalidate(); } }
  invalidate() { this.dispose(); this.set('closed'); }
  dispose() {
    this.active?.abort(); this.active = null; this.session = null; this.proof = null; this.operation = null;
    this.set('idle', { commitId: null, review: null, proofReady: false, submitted: false, progress: null });
  }
  stop() {
    if (!this.active) return;
    const tracking = this.view.phase === 'tracking';
    const local = this.view.phase === 'proving';
    this.active.abort(); this.active = null;
    this.set(tracking ? 'authorized' : local ? 'ready' : 'uncertain', { error: tracking ? 'backup/status-stopped'
      : local ? 'backup/verification-stopped' : 'backup/result-unknown' });
  }
  private async run(phase: Phase, action: (signal: AbortSignal, current: () => void) => Promise<void>, fallback: Phase) {
    if (this.active || this.view.phase === 'closed') return;
    const controller = new AbortController(); this.active = controller;
    const current = () => { controller.signal.throwIfAborted(); if (this.active !== controller) throw error('auth/session-changed'); this.session?.assertCurrent(); };
    const release = holdPageReload();
    let abort!: () => void;
    const cancelled = new Promise<never>((_, reject) => { abort = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', abort, { once: true }); });
    const timeout = setTimeout(() => controller.abort(error('backup/timeout')), phase === 'proving' ? 90_000 : 30_000);
    this.set(phase);
    try { await Promise.race([(async () => { current(); await action(controller.signal, current); })(), cancelled]); }
    catch (e) {
      if (this.active === controller) {
        const code = e && typeof e === 'object' && 'code' in e && typeof e.code === 'string' ? e.code : 'backup/unavailable';
        if (['auth/session-changed', 'auth/unauthenticated', 'client/update-required'].includes(code)) this.invalidate();
        else if (code === 'backup/expired') this.expire();
        else this.set(fallback, { error: phase === 'tracking' ? 'backup/status-unavailable' : code });
      }
    } finally {
      clearTimeout(timeout); controller.signal.removeEventListener('abort', abort);
      if (this.active === controller) this.active = null;
      release();
    }
  }
  private async sessionFor(current: () => void) {
    if (!this.session) { const session = await this.capture(); current(); session.assertCurrent(); this.session = session; }
    return this.session;
  }
  private accept(response: { wire: unknown }) {
    const wire = structuredClone(response.wire), preview = parseBackupCommitPreview(wire, this.choice, this.parent.wire, this.view.commitId!);
    if (this.operation && (JSON.stringify(this.operation.preview.observation) !== JSON.stringify(preview.observation)
      || this.operation.preview.compiled.digest !== preview.compiled.digest
      || (this.operation.preview.receipt.state === 'authorized' && preview.receipt.state !== 'authorized'))) throw error('backup/invalid');
    this.operation = { wire, preview };
    if (preview.receipt.state === 'authorized') this.proof = null;
    this.set(preview.receipt.state === 'authorized' ? 'authorized' : 'ready', {
      proofReady: this.proof !== null, submitted: preview.receipt.state === 'authorized' ? false : this.view.submitted,
      review: Object.freeze({ digest: preview.compiled.digest, account: preview.compiled.prepared.initial.account,
        network: preview.compiled.prepared.initial.profile.deployment.network_id, validUntil: preview.receipt.valid_until }) });
    if (preview.receipt.state !== 'authorized') { try { this.live(); } catch { this.expire(); } }
  }
  prepare() {
    if (!['idle', 'absent'].includes(this.view.phase)) return Promise.resolve();
    return this.run('loading', async (signal, current) => {
      if (!this.view.commitId) this.set('loading', { commitId: createResourceId('operation') });
      const session = await this.sessionFor(current); current();
      const response = await session.prepareCommit(this.choice, this.parent, this.view.commitId!, signal); current(); this.accept(response);
    }, 'uncertain');
  }
  restore(id?: string) {
    if (this.active || this.view.phase === 'closed') return Promise.resolve();
    try {
      if (!this.view.commitId) this.set('idle', { commitId: parseResourceId('operation', id!) });
      else if (id !== undefined) throw error('backup/invalid');
    } catch { this.set(this.view.phase, { error: 'backup/invalid' }); return Promise.resolve(); }
    return this.run('loading', async (signal, current) => {
      const session = await this.sessionFor(current); current();
      let response;
      try { response = await session.restoreCommit(this.choice, this.parent, this.view.commitId!, signal); current(); }
      catch (e) {
        current();
        if (e && typeof e === 'object' && 'code' in e && e.code === 'backup/not-found' && !this.operation && !this.view.submitted) { this.set('absent'); return; }
        throw e;
      }
      this.accept(response);
    }, 'uncertain');
  }
  confirm() {
    if (this.view.phase !== 'ready' || !this.session || !this.operation || this.proof || this.view.submitted) return Promise.resolve();
    return this.run('proving', async (signal, current) => {
      this.live(); const p = this.choice.consent.preparation, scope = this.choice.consent.expected.scope;
      const challenge = this.operation!.preview.compiled.digest;
      // Start the browser ceremony synchronously in the click's call stack.
      const wire = await this.prove({ scope, key: p.public_key, challenge, credentialId: p.credential_id,
        validUntilMs: this.operation!.preview.receipt.valid_until * 1000, signal });
      current(); this.live(); const proof = parseInitializationProof(wire);
      encodeWebAuthnAssertion({ scope, key: p.public_key, challenge, response: proof });
      this.proof = structuredClone(proof); this.set('ready', { proofReady: true });
    }, 'ready');
  }
  checkProgress() {
    if (this.view.phase !== 'authorized' || !this.session || !this.view.commitId) return Promise.resolve();
    this.set('authorized', { progress: null });
    return this.run('tracking', async (signal, current) => {
      const progress = await this.session!.status(this.choice, this.parent, this.view.commitId!, signal); current();
      if (progress.consent_state !== 'authorized') throw error('backup/invalid');
      this.set('authorized', { progress });
    }, 'authorized');
  }
  authorize() {
    if (this.view.phase !== 'ready' || !this.session || !this.operation || !this.proof) return Promise.resolve();
    return this.run('submitting', async (signal, current) => {
      this.live(); this.set('submitting', { submitted: true });
      const raw = await this.session!.authorizeCommit(this.choice, this.parent, this.operation!, this.view.commitId!, structuredClone(this.proof!), signal);
      current(); const receipt = parseBackupCommitReceipt(raw, this.choice, this.parent.wire, this.operation!.wire, this.view.commitId!);
      if (receipt.state !== 'authorized') throw error('backup/invalid');
      this.accept({ wire: { ...(this.operation!.wire as object), ...receipt } });
    }, 'uncertain');
  }
}
