import { afterEach, describe, expect, it, vi } from 'vitest';
import environments from '@gatopago/environment/environments.json';
import { parseEnvironment } from '@gatopago/environment';
import { buildAuthConfig, type EnabledAuthConfig } from '../src/auth/config';
import { balanceClient, parseBalanceView } from '../src/wallet/balances';
import { BalanceStore } from '../src/wallet/balance-store';
import type { BrowserAuth } from '../src/auth/browser';
import { balanceFixture } from './balances.fixture';
import { parseTransferStatus } from '../src/wallet/transfers';
import { createResourceId } from '@gatopago/shared/v3/primitives';

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
    const config = buildAuthConfig(parseEnvironment({ ...environments.production, status: 'provisioned', firebase_project_id: 'v3-runtime-test' }), {
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
function reconciledFixture(outcome: 'execution_succeeded' | 'execution_reverted' = 'execution_succeeded') {
  const f = storeFixture();
  const locator = { wallet_id: f.account.wallet_id, wallet_account_id: f.account.id, network_id: f.account.network_id,
    operation_id: createResourceId('operation') };
  const status = parseTransferStatus({ ...locator, status: 'reconciled', userop_hash: `0x${'11'.repeat(32)}`,
    historical_confirmation: { transaction_hash: `0x${'22'.repeat(32)}`, outcome, recorded_at: f.now },
    funds_reserved: false, settlement: 'not_assessed', send_enabled: false }, locator);
  return { ...f, status };
}

describe('Post-transfer balance refresh', () => {
  it.each(['execution_succeeded', 'execution_reverted'] as const)('refreshes once after reconciled %s, without altering the receipt', async outcome => {
    const f = reconciledFixture(outcome); await f.store.open();
    const updated = { ...parseBalanceView(f.wire, f.account, f.now), assets: [{ ...f.wire.balances[1], amount_atomic: '99' }] };
    f.session.read.mockResolvedValueOnce(updated);
    const task = f.store.refreshAfterTransfer(f.status);
    expect(f.store.snapshot().balance).toBeNull();
    await f.store.refreshAfterTransfer(f.status); await task;
    await f.store.refreshAfterTransfer(f.status);
    expect(f.session.accounts).toHaveBeenCalledTimes(1);
    expect(f.session.read).toHaveBeenCalledTimes(2);
    expect(f.store.snapshot()).toMatchObject({ phase: 'ready', selected: f.account, balance: updated });
    expect(f.status).toMatchObject({ status: 'reconciled', funds_reserved: false, send_enabled: false });
    f.store.dispose();
  });
  it.each(['held', 'expired', 'delivery_pending', 'confirmation_recorded', 'review_required'] as const)('does not refresh for %s', async status => {
    const f = reconciledFixture(); await f.store.open();
    await f.store.refreshAfterTransfer({ ...f.status, status, funds_reserved: status !== 'expired',
      historical_confirmation: ['confirmation_recorded', 'review_required'].includes(status) ? f.status.historical_confirmation : null });
    expect(f.session.read).toHaveBeenCalledTimes(1); f.store.dispose();
  });
  it.each(['wallet', 'account', 'network', 'invalid-operation'] as const)('ignores a mismatched %s result', async fault => {
    const f = reconciledFixture(); await f.store.open();
    const input = { ...f.status };
    if (fault === 'wallet') input.wallet_id = createResourceId('wallet');
    if (fault === 'account') input.wallet_account_id = createResourceId('walletAccount');
    if (fault === 'network') input.network_id = 'eip155:1';
    if (fault === 'invalid-operation') input.operation_id = 'not-an-operation';
    await f.store.refreshAfterTransfer(input);
    expect(f.session.read).toHaveBeenCalledTimes(1); f.store.dispose();
  });
  it('replaces an older in-flight read and discards its late response', async () => {
    const f = reconciledFixture(); await f.store.open();
    let finish!: (value: ReturnType<typeof parseBalanceView>) => void;
    f.session.read.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const old = f.store.refresh(), oldSignal = f.session.read.mock.calls[1][1];
    const updated = { ...parseBalanceView(f.wire, f.account, f.now), block_number: '101' };
    f.session.read.mockResolvedValueOnce(updated);
    await f.store.refreshAfterTransfer(f.status);
    expect(oldSignal.aborted).toBe(true);
    finish(parseBalanceView(f.wire, f.account, f.now)); await old;
    expect(f.store.snapshot().balance).toEqual(updated); f.store.dispose();
  });
  it('does not keep an old or failed balance and leaves retries explicit', async () => {
    const f = reconciledFixture(); await f.store.open();
    f.session.read.mockResolvedValueOnce({ ...parseBalanceView(f.wire, f.account, f.now), observed_at: f.now - 1 });
    await f.store.refreshAfterTransfer(f.status);
    expect(f.store.snapshot()).toMatchObject({ phase: 'error', balance: null });
    await f.store.refreshAfterTransfer(f.status);
    expect(f.session.read).toHaveBeenCalledTimes(2);
    await f.store.refresh();
    expect(f.store.snapshot().phase).toBe('ready'); f.store.dispose();
  });
  it('cannot restore a balance after same-user session replacement', async () => {
    const f = reconciledFixture(); await f.store.open();
    let finish!: (value: ReturnType<typeof parseBalanceView>) => void;
    f.session.read.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const task = f.store.refreshAfterTransfer(f.status), signal = f.session.read.mock.calls[1][1];
    f.session.assertCurrent.mockImplementation(() => { throw new Error('Session replaced'); });
    f.store.checkSession(); expect(signal.aborted).toBe(true);
    finish(parseBalanceView(f.wire, f.account, f.now)); await task;
    await f.store.refreshAfterTransfer(f.status);
    expect(f.store.snapshot()).toMatchObject({ phase: 'closed', balance: null });
    expect(f.session.read).toHaveBeenCalledTimes(2); f.store.dispose();
  });
});

describe('Balance view lifecycle', () => {
  it('loads the only complete account and its balance on opening, without another selection', async () => {
    const f = storeFixture();
    await f.store.open();
    expect(f.store.snapshot()).toMatchObject({ phase: 'ready', selected: f.account });
    expect(f.store.snapshot().balance).not.toBeNull();
    expect(f.session.accounts).toHaveBeenCalledTimes(1);
    expect(f.session.read).toHaveBeenCalledTimes(1);
    f.store.dispose();
  });
  it('keeps the verified sole account available for transfer lookup when its initial balance read fails', async () => {
    const f = storeFixture(); f.session.read.mockRejectedValueOnce(new Error('RPC unavailable'));
    await f.store.open();
    expect(f.store.snapshot()).toMatchObject({ phase:'error',page:{ data:[f.account],next_cursor:null },selected:f.account,balance:null });
    expect(f.session.accounts).toHaveBeenCalledTimes(1); expect(f.session.read).toHaveBeenCalledTimes(1);
    await f.store.refresh();
    expect(f.store.snapshot()).toMatchObject({ phase:'ready',selected:f.account });
    expect(f.session.accounts).toHaveBeenCalledTimes(1); expect(f.session.read).toHaveBeenCalledTimes(2);
    f.store.dispose();
  });
  it('requires a selection when there is more than one account or another page', async () => {
    const f = storeFixture();
    const other = { ...f.account, id: `${f.account.id.slice(0, -1)}1` };
    f.session.accounts.mockResolvedValueOnce({ data: [f.account, other], next_cursor: null });
    await f.store.open();
    expect(f.store.snapshot()).toMatchObject({ selected: null, balance: null });
    expect(f.session.read).not.toHaveBeenCalled();
    f.session.accounts.mockResolvedValueOnce({ data: [f.account], next_cursor: f.account.id });
    await f.store.open();
    expect(f.store.snapshot()).toMatchObject({ selected: null, balance: null });
    expect(f.session.read).not.toHaveBeenCalled();
    f.store.dispose();
  });
  it('deduplicates opening and discards a late balance after disposal', async () => {
    const f = storeFixture();
    let finish!: (value: ReturnType<typeof parseBalanceView>) => void;
    f.session.read.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const opening = f.store.open();
    await vi.waitFor(() => expect(f.session.read).toHaveBeenCalledTimes(1));
    expect(f.store.snapshot()).toMatchObject({ phase:'loading',page:{ data:[f.account],next_cursor:null },selected:f.account,balance:null });
    await f.store.open();
    expect(f.session.accounts).toHaveBeenCalledTimes(1);
    const signal = f.session.read.mock.calls[0][1];
    f.store.dispose();
    expect(signal.aborted).toBe(true);
    finish(parseBalanceView(f.wire, f.account, f.now));
    await opening;
    expect(f.store.snapshot()).toMatchObject({ phase: 'idle', page: null, selected: null, balance: null });
  });
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
