import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserAuth } from '../src/auth/browser';
import { MoneyExecutionFlow } from '../src/wallet/money-execution-flow';
import { parseMoneyPreparation, parseMoneyPreparationHistory, parseMoneyStatus } from '../src/wallet/money';
import { moneyBookmarkHash, parseMoneyBookmark } from '../src/wallet/money-bookmark';
import { moneyFixture } from './money.fixture';

beforeEach(() => vi.stubGlobal('window', {}));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function fixture(restored = false, consentLifetime?: number) {
  const f = moneyFixture(), preparation = parseMoneyPreparation(f.wire, f.selection, f.request, f.environment);
  const confirmation = { id: f.operationId, preparation_id: preparation.preparation_id, consent_digest: preparation.candidate.digest,
    state: 'authorized' as const, expires_at: preparation.expires_at, send_enabled: false as const };
  const restore = vi.fn(async () => parseMoneyPreparationHistory({ ...f.wire, operation_id: f.operationId }, f.selection, f.environment));
  const status = vi.fn(async () => parseMoneyStatus(f.status, f.selection, f.environment, f.operationId));
  const confirm = vi.fn(async () => confirmation), deliver = vi.fn(async () => ({ operation_id: f.operationId, state: 'dispatch_pending' as const, delivery: 'accepted' as const }));
  const assertCurrent = vi.fn(), persist = vi.fn();
  const unused = async () => { throw new Error('unexpected method'); };
  const session: Awaited<ReturnType<BrowserAuth['money']>> = { environment: f.environment, assertCurrent, selection: () => f.selection,
    prepare: unused, preparation: unused, restorePreparation: restore, confirm, deliver, status, capabilities: unused, position: unused };
  const flow = new MoneyExecutionFlow(session, f.selection, preparation, persist, restored,
    consentLifetime === undefined ? undefined : f.now + consentLifetime);
  return { ...f, preparation, restore, status, confirm, deliver, assertCurrent, persist, flow };
}
describe('Explicit monetary flow and recovery', () => {
  it('does not confirm after recipient resolution expires even while the money review is valid', async () => {
    const f = fixture(false, 1);
    vi.spyOn(Date, 'now').mockReturnValue((f.now + 1) * 1000);
    await f.flow.confirm([]);
    expect(f.confirm).not.toHaveBeenCalled();
    expect(f.persist).not.toHaveBeenCalled();
    expect(f.flow.canEdit()).toBe(true);
  });
  it('keeps read-only recovery after recipient expiry and refuses a first delivery', async () => {
    const f = fixture(false, 1);
    await f.flow.confirm([]);
    vi.spyOn(Date, 'now').mockReturnValue((f.now + 1) * 1000);
    await f.flow.deliver();
    expect(f.deliver).not.toHaveBeenCalled();
    await f.flow.readStatus();
    expect(f.status).toHaveBeenCalledTimes(1);
    expect(f.flow.snapshot()).toMatchObject({ phase: 'expired', operation_id: f.operationId, error: false });
    expect(f.flow.snapshot().status?.funds_reserved).toBe(true);
  });
  it('does nothing before a gesture; concurrent confirmation has one request and keeps a locator first', async () => {
    const f = fixture(); expect(f.confirm).not.toHaveBeenCalled(); expect(f.deliver).not.toHaveBeenCalled();
    await Promise.all([f.flow.confirm([]), f.flow.confirm([])]);
    expect(f.confirm).toHaveBeenCalledTimes(1); expect(f.persist.mock.invocationCallOrder[0]).toBeLessThan(f.confirm.mock.invocationCallOrder[0]);
    expect(f.flow.snapshot()).toMatchObject({ phase: 'authorized', operation_id: f.operationId }); expect(f.flow.canEdit()).toBe(false);
    expect(f.deliver).not.toHaveBeenCalled();
  });
  it('never confirms without a retained locator', async () => {
    const f = fixture(); f.persist.mockImplementation(() => { throw new Error('another unresolved operation'); });
    await f.flow.confirm([]); expect(f.confirm).not.toHaveBeenCalled(); expect(f.flow.canEdit()).toBe(true);
  });
  it('recovers a lost confirmation with GETs and no replay or new signature', async () => {
    const f = fixture(); f.confirm.mockRejectedValue(new Error('lost response'));
    await f.flow.confirm([]); expect(f.flow.snapshot().phase).toBe('confirmation-uncertain');
    await f.flow.readStatus(); expect(f.restore).toHaveBeenCalledTimes(1); expect(f.status).toHaveBeenCalledTimes(1);
    expect(f.confirm).toHaveBeenCalledTimes(1); expect(f.deliver).not.toHaveBeenCalled(); expect(f.flow.canDeliver()).toBe(true);
  });
  it('cannot return to editing when a lost confirmation lookup has no result yet', async () => {
    const f = fixture(); f.confirm.mockRejectedValue(new Error('lost response'));
    f.restore.mockResolvedValue(parseMoneyPreparationHistory(f.wire, f.selection, f.environment));
    await f.flow.confirm([]); await f.flow.readStatus(); await f.flow.confirm([]);
    expect(f.flow.snapshot().phase).toBe('confirmation-uncertain'); expect(f.flow.canEdit()).toBe(false);
    expect(f.confirm).toHaveBeenCalledTimes(1); expect(f.status).not.toHaveBeenCalled();
  });
  it('keeps delivery uncertain even if a later GET still says authorized', async () => {
    const f = fixture(); await f.flow.confirm([]); f.deliver.mockRejectedValue(new Error('timeout'));
    await Promise.all([f.flow.deliver(), f.flow.deliver()]); expect(f.deliver).toHaveBeenCalledTimes(1);
    expect(f.flow.snapshot().phase).toBe('delivery-uncertain'); await f.flow.readStatus();
    expect(f.flow.canDeliver()).toBe(false); await f.flow.deliver(); expect(f.deliver).toHaveBeenCalledTimes(1);
  });
  it('reopens an existing authorization with reads only and an explicit delivery button', async () => {
    const f = fixture(true); await f.flow.readStatus(); expect(f.confirm).not.toHaveBeenCalled(); expect(f.deliver).not.toHaveBeenCalled();
    expect(f.flow.canDeliver()).toBe(true); expect(f.flow.canEdit()).toBe(false);
    await f.flow.deliver(); expect(f.deliver).toHaveBeenCalledTimes(1); expect(f.flow.canDeliver()).toBe(false);
  });
  it('cannot deliver an expired restored authorization', async () => {
    const f = fixture(true); vi.spyOn(Date, 'now').mockReturnValue((f.now + 60) * 1000);
    await f.flow.readStatus(); expect(f.flow.snapshot().phase).toBe('expired'); expect(f.flow.canDeliver()).toBe(false);
    await f.flow.deliver(); expect(f.deliver).not.toHaveBeenCalled();
  });
  it('rejects a status bound to another preparation', async () => {
    const f = fixture(true); const wrong = moneyFixture();
    f.status.mockResolvedValue(parseMoneyStatus(wrong.status, wrong.selection, wrong.environment, wrong.operationId));
    await f.flow.readStatus(); expect(f.flow.snapshot().error).toBe(true); expect(f.flow.canDeliver()).toBe(false);
  });
  it('invalidates immediately on session loss and ignores a late confirmation response', async () => {
    const f = fixture(); let finish!: (value: Awaited<ReturnType<typeof f.confirm>>) => void;
    f.confirm.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.flow.confirm([]); f.flow.invalidate(); finish({ id: f.operationId, preparation_id: f.preparation.preparation_id,
      consent_digest: f.candidate.digest, state: 'authorized', expires_at: f.preparation.expires_at, send_enabled: false });
    await pending; expect(f.flow.snapshot().phase).toBe('closed'); expect(f.flow.snapshot().operation_id).toBeNull(); expect(f.deliver).not.toHaveBeenCalled();
  });
});
describe('Money locators contain no reusable authority', () => {
  it('roundtrips IDs only without amount, recipient, review or signature', () => {
    const f = fixture(), bookmark = f.flow.bookmark(), hash = moneyBookmarkHash(bookmark);
    expect(parseMoneyBookmark(hash)).toEqual(bookmark);
    expect(Object.keys(bookmark).sort()).toEqual(['network_id','operation_id','preparation_id','schema_version','wallet_account_id','wallet_id']);
  });
  it.each(['schema','extra-field','network','resource','operation','oversized'])('rejects %s', fault => {
    const f = fixture(), bookmark = { ...f.flow.bookmark() };
    if (fault === 'schema') Object.assign(bookmark, { schema_version: 2 });
    if (fault === 'extra-field') Object.assign(bookmark, { signature: '0x01' });
    if (fault === 'network') Object.assign(bookmark, { network_id: 'eip155:1' });
    if (fault === 'resource') bookmark.preparation_id = 'invalid';
    if (fault === 'operation') bookmark.operation_id = 'invalid';
    expect(() => fault === 'oversized' ? parseMoneyBookmark('#money-v1=' + 'x'.repeat(2048)) : moneyBookmarkHash(bookmark)).toThrow();
  });
});
