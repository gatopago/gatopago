import type { BrowserAuth } from '../auth/browser';
import type { AccountChoice, BalanceView } from './balances';
import type { TransferSelection } from './transfer-preparation';
import { transferAssets } from './transfer-form';
import { parseTransferBookmark, transferBookmarkHash, type TransferBookmark } from './transfer-bookmark';

type Session = ReturnType<BrowserAuth['accountContexts']>;
type View = { phase:'idle'|'loading'|'open'|'error'|'closed'; error:string|null;
  form:{ selected:TransferSelection; balance:BalanceView|null; bookmark:TransferBookmark|null; environment:Session['environment'] }|null };

/** Opening an editor is explicit and read-only. A balance is metadata, not a
 * budget. Snapshot it once: expiration/refresh must not discard an active payment. */
export class TransferEntryStore {
 private view:View = { phase:'idle',error:null,form:null };
 private readonly listeners = new Set<() => void>();
 private readonly account:AccountChoice;
 private session:Session|null = null;
 private active:AbortController|null = null;
 constructor(private readonly capture:() => Session, account:AccountChoice) { this.account = structuredClone(account); }
 snapshot = () => this.view;
 subscribe = (listener:() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
 private set(next:View) { this.view = next; this.listeners.forEach(listener => listener()); }
 dispose() { this.active?.abort(); this.active = null; this.session = null; this.set({ phase:'closed',error:null,form:null }); }
 invalidate() { this.dispose(); this.set({ phase:'closed',error:'auth/session-changed',form:null }); }
 checkSession() { try { this.session?.assertCurrent(); } catch { this.invalidate(); } }
 finishRestoration() {
  if (!this.view.form?.bookmark || this.active || this.view.phase === 'closed') return;
  this.session?.assertCurrent(); this.set({ phase:'idle',error:null,form:null });
 }
 async open(input:BalanceView|null, bookmarkInput?:TransferBookmark) {
  if (this.active || this.view.phase === 'open' || this.view.phase === 'closed') return;
  const controller = new AbortController(); this.active = controller;
  this.set({ phase:'loading',error:null,form:null });
  try {
   const bookmark = bookmarkInput ? parseTransferBookmark(transferBookmarkHash(bookmarkInput)) : null;
   const balance = bookmark ? null : structuredClone(input), now = Math.floor(Date.now()/1000);
   if (bookmark) {
    if (bookmark.wallet_id !== this.account.wallet_id || bookmark.wallet_account_id !== this.account.id
     || bookmark.network_id !== this.account.network_id) throw new Error('Crossed restoration');
   } else if (!balance || balance.account.id !== this.account.id || balance.account.wallet_id !== this.account.wallet_id
    || balance.account.network_id !== this.account.network_id || now < balance.observed_at || now >= balance.expires_at) throw new Error('Unavailable balance');
   const session = this.session ?? this.capture(); this.session = session; session.assertCurrent();
   const selected = await session.read(this.account,controller.signal);
   if (controller.signal.aborted || this.active !== controller) return;
   session.assertCurrent();
   if (selected.wallet_id !== this.account.wallet_id || selected.wallet_account_id !== this.account.id
    || selected.network_id !== this.account.network_id) throw new Error('Crossed account context');
   if (balance) transferAssets(balance,selected);
   this.set({ phase:'open',error:null,form:{ selected:structuredClone(selected),balance,bookmark,environment:session.environment } });
  } catch (error) {
   if (controller.signal.aborted || this.active !== controller) return;
   const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'wallet/unavailable';
   if (code === 'auth/session-changed' || code === 'auth/unauthenticated') this.invalidate();
   else this.set({ phase:'error',error:code,form:null });
  } finally { if (this.active === controller) this.active = null; }
 }
}
