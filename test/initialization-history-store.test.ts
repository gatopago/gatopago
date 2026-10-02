import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserAuth } from '../src/auth/browser';
import { InitializationHistoryStore } from '../src/wallet/initialization-history-store';
import type { InitializationHistoryItem } from '@gatopago/shared/v3/initialization-wire';
type Session = Awaited<ReturnType<BrowserAuth['initialization']>>;
const item = (id: number, state: InitializationHistoryItem['state'] = 'expired'): InitializationHistoryItem => ({
  initialization_id: `op_00000000-0000-4000-8000-${id.toString().padStart(12, '0')}`,
  credential_ref: 'op_00000000-0000-4000-8000-000000000001', profile_sha256: `0x${'a'.repeat(64)}`, approval_digest: `0x${'b'.repeat(64)}`,
  created_at: 1000, expires_at: 1300, state, creation_operation_recorded: false,
});
const page = (data: InitializationHistoryItem[] = [], cursor: string | null = null) => ({ observed_at: 1400, data, next_cursor: cursor });
function fixture() {
  const session = { assertCurrent: vi.fn(), history: vi.fn<Session['history']>().mockResolvedValue(page()), restore: vi.fn<Session['restore']>(),
    prepare: vi.fn<Session['prepare']>(), authorize: vi.fn<Session['authorize']>() };
  const capture = vi.fn(async () => session);
  return { session, capture, store: new InitializationHistoryStore(capture) };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
describe('component-owned history, no automatic creation', () => {
  it('does not load at construction; empty history permits explicit new configuration only after a completed read', async () => {
    const t = fixture(); expect(t.store.snapshot()).toEqual({ phase: 'loading' }); expect(t.capture).not.toHaveBeenCalled();
    await t.store.refresh(); expect(t.store.snapshot()).toMatchObject({ phase: 'ready', canStart: true });
    expect(t.session.prepare).not.toHaveBeenCalled(); expect(t.session.authorize).not.toHaveBeenCalled();
  });
  it('does not offer a new account after history failure', async () => {
    const t = fixture(); t.session.history.mockRejectedValueOnce(new Error('offline')); await t.store.refresh();
    expect(t.store.snapshot()).toMatchObject({ phase: 'error' }); expect(t.store.snapshot()).not.toHaveProperty('canStart');
    await t.store.retry(); expect(t.store.snapshot()).toMatchObject({ phase: 'ready', canStart: true });
  });
  it.each([true, false])('checks every page and remembers prior authorized records: %s', async (authorized) => {
    const t = fixture(), rows = Array.from({ length: 10 }, (_, index) => item(20 - index));
    if (authorized) rows[0] = item(20, 'authorized');
    const cursor = `v1:1000:${rows[9].initialization_id}`;
    t.session.history.mockResolvedValueOnce(page(rows, cursor)).mockResolvedValueOnce(page([item(10)]));
    await t.store.refresh(); expect(t.store.snapshot()).toMatchObject({ phase: 'ready', canStart: false });
    await t.store.next(); expect(t.store.snapshot()).toMatchObject({ phase: 'ready', canStart: !authorized });
    expect(t.session.history.mock.calls[1][0]).toBe(cursor);
  });
  it('rejects non-advancing pages instead of looping indefinitely', async () => {
    const t = fixture(), rows = Array.from({ length: 10 }, (_, index) => item(20 - index));
    const first = page(rows, `v1:1000:${rows[9].initialization_id}`); t.session.history.mockResolvedValue(first);
    await t.store.refresh(); await t.store.next(); expect(t.store.snapshot()).toMatchObject({ phase: 'error' });
    await t.store.next(); expect(t.session.history).toHaveBeenCalledTimes(2);
  });
  it('ignores late data after identity change', async () => {
    const t = fixture(); let resolve!: (value: ReturnType<typeof page>) => void;
    t.session.history.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const pending = t.store.refresh(); await Promise.resolve(); t.store.invalidate(); resolve(page([item(1)])); await pending;
    expect(t.store.snapshot()).toEqual({ phase: 'closed', code: 'auth/session-changed' }); await t.store.refresh(); expect(t.capture).toHaveBeenCalledOnce();
  });
  it('bounds even a stalled session import and ignores its late completion', async () => {
    const t = fixture(); let resolve!: (value: typeof t.session) => void;
    t.capture.mockReturnValueOnce(new Promise((done) => { resolve = done; })); const pending = t.store.refresh();
    await vi.advanceTimersByTimeAsync(20_000); await pending; expect(t.store.snapshot()).toMatchObject({ phase: 'error' });
    resolve(t.session); await Promise.resolve(); expect(t.session.history).not.toHaveBeenCalled();
    await t.store.retry(); expect(t.store.snapshot()).toMatchObject({ phase: 'ready' });
  });
  it('supports StrictMode cleanup/reconnection without showing an obsolete page', async () => {
    const t = fixture(); await t.store.refresh(); t.store.cancel(); expect(t.store.snapshot()).toEqual({ phase: 'loading' });
    await t.store.refresh(); t.session.assertCurrent.mockImplementation(() => { throw new Error('changed'); }); t.store.checkSession();
    expect(t.store.snapshot().phase).toBe('closed'); expect(t.session.prepare).not.toHaveBeenCalled();
  });
});
