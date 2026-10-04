import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createResourceId } from '@gatopago/shared/v3/primitives';
import {
  clearMoneyBookmark,
  moneyStoredSnapshot,
  parseMoneyBookmark,
  saveMoneyBookmark,
  type MoneyBookmark,
} from '../src/wallet/money-bookmark';

function browser() {
  const storage = new Map<string, string>(),
    location = { hash: '', pathname: '/grow', search: '' };
  const win = Object.assign(new EventTarget(), {
    location,
    history: {
      state: null,
      replaceState: vi.fn((_state: unknown, _title: string, url: string) => {
        location.hash = new URL(url, 'https://gatopago.com').hash;
      }),
    },
    localStorage: {
      get length() {
        return storage.size;
      },
      key: (index: number) => [...storage.keys()][index] ?? null,
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  });
  vi.stubGlobal('window', win);
  return { win, storage, location };
}
beforeEach(() => browser());
afterEach(() => vi.unstubAllGlobals());
const fixture = (): MoneyBookmark => ({
  schema_version: 1,
  wallet_id: createResourceId('wallet'),
  wallet_account_id: createResourceId('walletAccount'),
  network_id: 'eip155:421614',
  preparation_id: createResourceId('operation'),
  operation_id: null,
});
describe('Durable unsigned money locators', () => {
  it('finds an unresolved operation when reopening the plain app URL', () => {
    const { location } = browser(),
      saved = fixture();
    saveMoneyBookmark(saved);
    location.hash = '';
    const snapshots: string[] = JSON.parse(moneyStoredSnapshot(saved));
    expect(snapshots).toHaveLength(1);
    expect(parseMoneyBookmark(snapshots[0])).toEqual(saved);
    expect(moneyStoredSnapshot(saved)).toBe(JSON.stringify(snapshots));
  });
  it('updates the same locator after confirmation and clears that exact reference', () => {
    const saved = fixture();
    saveMoneyBookmark(saved);
    const confirmed = { ...saved, operation_id: createResourceId('operation') };
    saveMoneyBookmark(confirmed);
    expect(parseMoneyBookmark(window.location.hash)).toEqual(confirmed);
    clearMoneyBookmark(confirmed);
    expect(window.location.hash).toBe('');
    expect(moneyStoredSnapshot(saved)).toBe('[]');
  });
  it('does not expose references from another account', () => {
    const saved = fixture();
    saveMoneyBookmark(saved);
    expect(
      moneyStoredSnapshot({ ...saved, wallet_account_id: createResourceId('walletAccount') }),
    ).toBe('[]');
  });
  it.each([
    'legacy',
    'other-preparation',
    'changed-operation',
    'clear-wrong-id',
    'clear-stale-locator',
  ])('preserves an existing %s reference', (fault) => {
    const { location } = browser(),
      saved = fixture(),
      operation_id = createResourceId('operation');
    saveMoneyBookmark({ ...saved, operation_id });
    if (fault === 'legacy') {
      location.hash = '#transfer-v3=unresolved';
      expect(() => saveMoneyBookmark(saved)).toThrow();
    } else if (fault === 'other-preparation')
      expect(() =>
        saveMoneyBookmark({ ...saved, preparation_id: createResourceId('operation') }),
      ).toThrow();
    else if (fault === 'changed-operation')
      expect(() =>
        saveMoneyBookmark({ ...saved, operation_id: createResourceId('operation') }),
      ).toThrow();
    else if (fault === 'clear-wrong-id')
      expect(() =>
        clearMoneyBookmark({
          ...saved,
          preparation_id: createResourceId('operation'),
          operation_id,
        }),
      ).toThrow();
    else expect(() => clearMoneyBookmark(saved)).toThrow();
    expect(JSON.parse(moneyStoredSnapshot(saved))).toHaveLength(1);
  });
  it('keeps bounded references without silently deleting any unresolved operation', () => {
    const { location } = browser(),
      saved = fixture();
    for (let index = 0; index < 16; index++) {
      location.hash = '';
      saveMoneyBookmark({ ...saved, preparation_id: createResourceId('operation') });
    }
    location.hash = '';
    expect(() =>
      saveMoneyBookmark({ ...saved, preparation_id: createResourceId('operation') }),
    ).toThrow('MONEY_BOOKMARK_CAPACITY');
    expect(JSON.parse(moneyStoredSnapshot(saved))).toHaveLength(16);
  });
  it('does not accept a tampered stored record as authority or overwrite it', () => {
    const { storage, location } = browser(),
      saved = fixture();
    saveMoneyBookmark(saved);
    storage.set([...storage.keys()][0], '#money-v1=invalid');
    location.hash = '';
    expect(() => moneyStoredSnapshot(saved)).toThrow();
    expect(() => saveMoneyBookmark(saved)).toThrow();
  });
  it('fails closed before confirmation if locator persistence is unavailable', () => {
    const { win } = browser();
    vi.spyOn(win.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => saveMoneyBookmark(fixture())).toThrow('quota');
  });
});
