import { parseResourceId } from '@gatopago/shared/v3/primitives';
import { exact, record } from './http';

const prefix = '#money-v1=';
const storagePrefix = 'gatopago.money.locator.v1.';
export type MoneyBookmark = Readonly<{
  schema_version: 1;
  wallet_id: string;
  wallet_account_id: string;
  network_id: 'eip155:421614';
  preparation_id: string;
  operation_id: string | null;
}>;
/** Resource locators only. Fragments never enter HTTP requests or referrers.
 * They carry no review, amount, recipient, signature or sending authority. */
export function parseMoneyBookmark(hash: string): MoneyBookmark | null {
  if (!hash.startsWith(prefix)) return null;
  if (hash.length > 2048) throw new Error('INVALID_MONEY_BOOKMARK');
  const value: unknown = JSON.parse(decodeURIComponent(hash.slice(prefix.length)));
  if (
    !record(value) ||
    !exact(value, [
      'schema_version',
      'wallet_id',
      'wallet_account_id',
      'network_id',
      'preparation_id',
      'operation_id',
    ]) ||
    value.schema_version !== 1 ||
    value.network_id !== 'eip155:421614'
  )
    throw new Error('INVALID_MONEY_BOOKMARK');
  return Object.freeze({
    schema_version: 1,
    wallet_id: parseResourceId('wallet', value.wallet_id),
    wallet_account_id: parseResourceId('walletAccount', value.wallet_account_id),
    network_id: value.network_id,
    preparation_id: parseResourceId('operation', value.preparation_id),
    operation_id:
      value.operation_id === null ? null : parseResourceId('operation', value.operation_id),
  });
}
export function moneyBookmarkHash(input: MoneyBookmark) {
  const hash = prefix + encodeURIComponent(JSON.stringify(input));
  parseMoneyBookmark(hash);
  return hash;
}
export function saveMoneyBookmark(input: MoneyBookmark) {
  const hash = moneyBookmarkHash(input),
    existing = parseMoneyBookmark(window.location.hash);
  if (window.location.hash && !existing) throw new Error('ANOTHER_OPERATION_BOOKMARK');
  if (
    existing &&
    (existing.wallet_id !== input.wallet_id ||
      existing.wallet_account_id !== input.wallet_account_id ||
      existing.preparation_id !== input.preparation_id ||
      (existing.operation_id !== null && existing.operation_id !== input.operation_id))
  )
    throw new Error('ANOTHER_OPERATION_BOOKMARK');
  window.history.replaceState(
    window.history.state,
    '',
    window.location.pathname + window.location.search + hash,
  );
  if (window.location.hash !== hash) throw new Error('MONEY_BOOKMARK_NOT_RETAINED');
  const key = storageKey(input),
    prior = window.localStorage.getItem(key);
  if (prior !== null) {
    const saved = parseMoneyBookmark(prior);
    if (
      !saved ||
      saved.preparation_id !== input.preparation_id ||
      (saved.operation_id !== null && saved.operation_id !== input.operation_id)
    )
      throw new Error('MONEY_BOOKMARK_CHANGED');
  } else if (JSON.parse(moneyStoredSnapshot(input)).length >= 16)
    throw new Error('MONEY_BOOKMARK_CAPACITY');
  window.localStorage.setItem(key, hash);
  if (window.localStorage.getItem(key) !== hash) throw new Error('MONEY_BOOKMARK_NOT_RETAINED');
  window.dispatchEvent(new Event('money-bookmark-change'));
}
export function clearMoneyBookmark(input: MoneyBookmark) {
  if (JSON.stringify(parseMoneyBookmark(window.location.hash)) !== JSON.stringify(input))
    throw new Error('MONEY_BOOKMARK_CHANGED');
  const saved = window.localStorage.getItem(storageKey(input));
  if (saved !== null && JSON.stringify(parseMoneyBookmark(saved)) !== JSON.stringify(input))
    throw new Error('MONEY_BOOKMARK_CHANGED');
  window.localStorage.removeItem(storageKey(input));
  window.history.replaceState(
    window.history.state,
    '',
    window.location.pathname + window.location.search,
  );
  window.dispatchEvent(new Event('money-bookmark-change'));
}
export const moneyBookmarkSnapshot = () => window.location.hash;
export const moneyBookmarkServerSnapshot = () => '';
export function subscribeMoneyBookmark(listener: () => void) {
  window.addEventListener('hashchange', listener);
  window.addEventListener('money-bookmark-change', listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener('hashchange', listener);
    window.removeEventListener('money-bookmark-change', listener);
    window.removeEventListener('storage', listener);
  };
}
function storageScope(input: Pick<MoneyBookmark, 'wallet_id' | 'wallet_account_id'>) {
  return (
    storagePrefix +
    parseResourceId('wallet', input.wallet_id) +
    '.' +
    parseResourceId('walletAccount', input.wallet_account_id) +
    '.'
  );
}
const storageKey = (input: MoneyBookmark) =>
  storageScope(input) + parseResourceId('operation', input.preparation_id);
/** Persist only bounded resource locators so opening the plain app URL can find
 * unresolved operations. Each recovered ID still needs server-side ownership. */
export function moneyStoredSnapshot(
  account: Pick<MoneyBookmark, 'wallet_id' | 'wallet_account_id'>,
) {
  const scope = storageScope(account),
    hashes: string[] = [];
  for (let index = 0; index < window.localStorage.length; index++) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(scope)) continue;
    const hash = window.localStorage.getItem(key);
    if (!hash) throw new Error('MONEY_BOOKMARK_CHANGED');
    const value = parseMoneyBookmark(hash);
    if (
      !value ||
      key !== storageKey(value) ||
      value.wallet_id !== account.wallet_id ||
      value.wallet_account_id !== account.wallet_account_id
    )
      throw new Error('MONEY_BOOKMARK_CHANGED');
    hashes.push(hash);
    if (hashes.length > 16) throw new Error('MONEY_BOOKMARK_CAPACITY');
  }
  return JSON.stringify(hashes.sort());
}
export const moneyStoredServerSnapshot = () => '[]';
