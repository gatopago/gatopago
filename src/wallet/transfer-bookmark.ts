import { requireHash } from '@gatopago/shared/v3/deployment';
import { parseNetworkId, parseResourceId } from '@gatopago/shared/v3/primitives';
import { exact, record } from './http';

const prefix = '#transfer-v3=';
export type TransferBookmark = Readonly<{ wallet_id: string; wallet_account_id: string; network_id: string;
  consent_digest: `0x${string}`; expires_at: number }>;

/** A locator only: no credentials, proofs, amount, destination or send authority.
 * URL fragments survive reload without entering API requests or HTTP referrers.
 * Every restoration still requires current server-side account ownership. */
export function parseTransferBookmark(hash: string): TransferBookmark | null {
  if (!hash.startsWith(prefix)) return null;
  if (hash.length > 1024) throw new Error('Invalid transfer bookmark');
  const input: unknown = JSON.parse(decodeURIComponent(hash.slice(prefix.length)));
  if (!record(input) || !exact(input, ['wallet_id','wallet_account_id','network_id','consent_digest','expires_at'])
    || typeof input.expires_at !== 'number' || !Number.isSafeInteger(input.expires_at) || input.expires_at < 1) throw new Error('Invalid transfer bookmark');
  requireHash(input.consent_digest);
  return Object.freeze({ wallet_id: parseResourceId('wallet', input.wallet_id), wallet_account_id: parseResourceId('walletAccount', input.wallet_account_id),
    network_id: parseNetworkId(input.network_id), consent_digest: input.consent_digest, expires_at: input.expires_at });
}
export function transferBookmarkHash(input: TransferBookmark) {
  const hash = prefix + encodeURIComponent(JSON.stringify(input));
  parseTransferBookmark(hash);
  return hash;
}
export const transferBookmarkSnapshot = () => window.location.hash;
export const transferBookmarkServerSnapshot = () => '';
export function subscribeTransferBookmark(listener: () => void) {
  window.addEventListener('hashchange', listener); window.addEventListener('transfer-bookmark-change', listener);
  return () => { window.removeEventListener('hashchange', listener); window.removeEventListener('transfer-bookmark-change', listener); };
}
export function saveTransferBookmark(input: TransferBookmark) {
  const hash = transferBookmarkHash(input), existing = parseTransferBookmark(window.location.hash);
  if (existing && JSON.stringify(existing) !== JSON.stringify(parseTransferBookmark(hash))) throw new Error('An unresolved transfer already exists');
  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search + hash);
  if (window.location.hash !== hash) throw new Error('Transfer bookmark was not retained');
  window.dispatchEvent(new Event('transfer-bookmark-change'));
}
export function clearTransferBookmark(input: TransferBookmark) {
  if (JSON.stringify(parseTransferBookmark(window.location.hash)) !== JSON.stringify(input)) throw new Error('Transfer bookmark changed');
  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  window.dispatchEvent(new Event('transfer-bookmark-change'));
}
