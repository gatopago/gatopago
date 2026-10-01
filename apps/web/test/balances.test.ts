import { afterEach, describe, expect, it, vi } from 'vitest';
import environments from '@gatopago/environment/environments.json';
import { parseEnvironment } from '@gatopago/environment';
import { buildAuthConfig, type EnabledAuthConfig } from '../src/auth/config';
import { balanceClient, parseBalanceView } from '../src/wallet/balances';
import { BalanceStore } from '../src/wallet/balance-store';
import type { BrowserAuth } from '../src/auth/browser';
import { balanceFixture } from './balances.fixture';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('Balance display contract', () => {
  it('keeps zero distinct from unavailable, with full token precision', () => {
    const f = balanceFixture(); const result = parseBalanceView(f.wire, f.account, f.now);
    expect(result.assets.map((a) => a.amount_atomic)).toEqual(['0', '12345987654']);
    f.wire.balances[0].amount_atomic = '5'; expect(result.assets[0].amount_atomic).toBe('0');
  });
  it.each(['wallet','account','network','expired','future','precision','duplicate','foreign-asset','checkpoint','extra'] as const)('rejects %s data', (fault) => {
    const f = balanceFixture();
    if (fault === 'wallet') f.wire.wallet_id = 'other';
    if (fault === 'account') f.wire.wallet_account_id = 'other';
    if (fault === 'network') f.wire.network_id = 'eip155:1';
    if (fault === 'expired') f.wire.expires_at = f.now;
    if (fault === 'future') f.wire.observed_at = f.now + 1;
    if (fault === 'precision') f.wire.balances[0].decimals = 256;
    if (fault === 'duplicate') f.wire.balances.push(f.wire.balances[0]);
    if (fault === 'foreign-asset') f.wire.balances[0].asset_id = 'eip155:1/slip44:60';
    if (fault === 'checkpoint') f.wire.finality_evidence.target.block_number = '101';
    if (fault === 'extra') Object.assign(f.wire, { spend_enabled: true });
    expect(() => parseBalanceView(f.wire, f.account, f.now)).toThrow();
  });
  it('uses one private GET for each explicit accounts/balance read', async () => {
    const f = balanceFixture();
    const config = buildAuthConfig(parseEnvironment({ ...environments.staging, status: 'provisioned', firebase_project_id: 'v3-runtime-test' }), {
      apiKey: `AIza${'a'.repeat(35)}`, appId: '1:123:web:abcdef', turnstileSiteKey: `0x${'a'.repeat(22)}` }) as EnabledAuthConfig;
    const transport = vi.fn().mockResolvedValueOnce(Response.json({ data: [], next_cursor: null })).mockResolvedValueOnce(Response.json(f.wire));
    vi.stubGlobal('fetch', transport); const client = balanceClient(config, async () => 'synthetic-token');
    await client.accounts(f.account.wallet_id, null, new AbortController().signal);
    await client.read(f.account, new AbortController().signal);
    expect(transport).toHaveBeenCalledTimes(2);
    for (const [, init] of transport.mock.calls) expect(init).toMatchObject({ method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error' });
    expect(transport.mock.calls[1][0]).toContain(`/accounts/${f.account.id}/balances`);
  });
});

function storeFixture() {
  const f = balanceFixture(); const session = {
    assertCurrent: vi.fn(), accounts: vi.fn<ReturnType<BrowserAuth['balances']>['accounts']>(async () => ({ data: [f.account], next_cursor: null })),
    read: vi.fn<ReturnType<BrowserAuth['balances']>['read']>(async () => parseBalanceView(f.wire, f.account, f.now)),
  };
  const capture = vi.fn(() => session); const store = new BalanceStore(capture, f.account.wallet_id);
  return { ...f, session, capture, store };
}
describe('Balance view lifecycle', () => {
  it('does no work on construction and removes expired amounts without polling', async () => {
    vi.useFakeTimers(); const f = storeFixture(); expect(f.capture).not.toHaveBeenCalled();
    await f.store.loadAccounts(); await f.store.select(f.account.id); expect(f.store.snapshot().balance).not.toBeNull();
    await vi.advanceTimersByTimeAsync(30_000); expect(f.store.snapshot()).toMatchObject({ phase: 'expired', balance: null });
    expect(f.session.read).toHaveBeenCalledTimes(1); f.store.dispose();
  });
  it('clears a previous amount before refresh and never displays zero on failure', async () => {
    const f = storeFixture(); await f.store.loadAccounts(); await f.store.select(f.account.id);
    f.session.read.mockRejectedValueOnce(new Error('RPC unavailable'));
    const task = f.store.refresh(); expect(f.store.snapshot().balance).toBeNull(); await task;
    expect(f.store.snapshot()).toMatchObject({ phase: 'error', balance: null }); f.store.dispose();
  });
  it('discards late reads after clearing selection, without restoring the old account', async () => {
    const f = storeFixture(); await f.store.loadAccounts(); let resolve!: (v: ReturnType<typeof parseBalanceView>) => void;
    f.session.read.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const task = f.store.select(f.account.id); await f.store.select('');
    resolve(parseBalanceView(f.wire, f.account, f.now)); await task;
    expect(f.store.snapshot()).toMatchObject({ selected: null, balance: null }); f.store.dispose();
  });
  it('closes on same-UID session replacement and cannot reopen through a stale selection event', async () => {
    const f = storeFixture(); await f.store.loadAccounts(); await f.store.select(f.account.id);
    f.session.assertCurrent.mockImplementation(() => { throw new Error('replaced'); }); f.store.checkSession(); await f.store.select('');
    expect(f.store.snapshot()).toMatchObject({ phase: 'closed', page: null, balance: null }); f.store.dispose();
  });
  it('supports Strict Mode cleanup and prevents duplicate same-account reads', async () => {
    const f = storeFixture(); f.store.dispose(); expect(f.capture).not.toHaveBeenCalled(); await f.store.loadAccounts();
    let resolve!: (v: ReturnType<typeof parseBalanceView>) => void;
    f.session.read.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const task = f.store.select(f.account.id); await f.store.select(f.account.id);
    expect(f.session.read).toHaveBeenCalledTimes(1); resolve(parseBalanceView(f.wire, f.account, f.now)); await task; f.store.dispose();
  });
  it('keeps account B selected when an aborted read of A finishes later', async () => {
    const f = storeFixture(); const other = { ...f.account,
      id: `${f.account.id.slice(0, -1)}${f.account.id.endsWith('0') ? '1' : '0'}` };
    f.session.accounts.mockResolvedValueOnce({ data: [f.account, other], next_cursor: null });
    await f.store.loadAccounts();
    let finishA!: (value: ReturnType<typeof parseBalanceView>) => void;
    f.session.read.mockReturnValueOnce(new Promise((resolve) => { finishA = resolve; }));
    const taskA = f.store.select(f.account.id);
    const signalA = f.session.read.mock.calls[0][1];
    const balanceB = { ...parseBalanceView(f.wire, f.account, f.now), account: other };
    f.session.read.mockResolvedValueOnce(balanceB);
    await f.store.select(other.id);
    expect(signalA.aborted).toBe(true);
    finishA(parseBalanceView(f.wire, f.account, f.now)); await taskA;
    expect(f.store.snapshot()).toMatchObject({ phase: 'ready', selected: other, balance: balanceB });
    f.store.dispose();
  });
  it('removes a balance on clock rollback without requesting a replacement automatically', async () => {
    vi.useFakeTimers(); const f = storeFixture(); await f.store.loadAccounts(); await f.store.select(f.account.id);
    vi.setSystemTime((f.now - 1) * 1000); f.store.expire();
    expect(f.store.snapshot()).toMatchObject({ phase: 'expired', balance: null });
    expect(f.session.read).toHaveBeenCalledTimes(1); f.store.dispose();
  });
});
