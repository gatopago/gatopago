import type { CredentialInventory } from '@gatopago/shared/v3/credential-inventory';
import type { CreationConsent } from '@gatopago/shared/v3/creation-operation-wire';
import type { BrowserAuth } from '../auth/browser';
import type { CreationProfilePin } from './creation-release';
import { passkeyPolicyDraft, policySelection } from './backup-policy';

type Session = Pick<ReturnType<BrowserAuth['credentialInventory']>, 'assertCurrent' | 'detail'>;
type Draft = ReturnType<typeof passkeyPolicyDraft>;
type View = Readonly<{ phase: 'idle' | 'loading' | 'ready' | 'error' | 'closed'; draft: Draft | null; code: string | null }>;

/** Per-mounted review. No signing, POST, storage, polling or module-global I/O.
 * Selection is copied before async reads; any replacement discards the old review.
 */
export class BackupPolicyStore {
  private view: View = Object.freeze({ phase: 'idle', draft: null, code: null });
  private session: Session | null = null;
  private active: AbortController | null = null;
  private listeners = new Set<() => void>();
  constructor(private readonly capture: () => Session) {}
  snapshot = () => this.view;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private set(phase: View['phase'], draft: Draft | null = null, code: string | null = null) {
    this.view = Object.freeze({ phase, draft, code }); this.listeners.forEach((listener) => listener());
  }
  checkSession() { try { this.session?.assertCurrent(); } catch { this.invalidate(); } }
  invalidate() {
    this.active?.abort(); this.active = null; this.session = null; this.set('closed', null, 'auth/session-changed');
  }
  clear() {
    this.active?.abort(); this.active = null; this.session = null;
    if (this.view.phase !== 'closed') this.set('idle');
  }
  async review(consent: CreationConsent, inventory: CredentialInventory, references: readonly string[], pin: CreationProfilePin) {
    if (this.view.phase === 'closed') return;
    this.clear(); const controller = new AbortController(); this.active = controller; this.set('loading');
    let timer: ReturnType<typeof setTimeout> | undefined;
    let rejectAbort: (() => void) | undefined;
    try {
      const selected = policySelection(consent, inventory, references, pin);
      const session = this.capture(); this.session = session; session.assertCurrent();
      const bounded = new Promise<never>((_resolve, reject) => {
        rejectAbort = () => reject(controller.signal.reason); controller.signal.addEventListener('abort', rejectAbort, { once: true });
        timer = setTimeout(() => controller.abort(new Error('Credential review timed out')), 30_000);
      });
      // No waterfall: each read is owner-scoped and bounded. Promise.race observes
      // late failures even when a transport does not honor cancellation.
      const material = await Promise.race([Promise.all(selected.references.map((id) => Promise.resolve().then(() => {
        controller.signal.throwIfAborted(); session.assertCurrent(); return session.detail(id, controller.signal);
      }))), bounded]);
      if (this.active !== controller) return;
      controller.signal.throwIfAborted(); session.assertCurrent();
      const draft = passkeyPolicyDraft(selected, material); session.assertCurrent(); this.set('ready', draft);
    } catch (error) {
      if (this.active !== controller) return;
      controller.abort();
      const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'credentials/unavailable';
      if (code === 'auth/session-changed' || code === 'auth/unauthenticated') this.invalidate();
      else this.set('error', null, code);
    } finally {
      clearTimeout(timer);
      if (rejectAbort) controller.signal.removeEventListener('abort', rejectAbort);
      if (this.active === controller) this.active = null;
    }
  }
}
