import { afterEach, describe, expect, it, vi } from 'vitest';
import { createResourceId } from '@gatopago/shared/v3/primitives';
import environments from '@gatopago/environment/environments.json';
import { parseEnvironment } from '@gatopago/environment';
import { buildAuthConfig, type EnabledAuthConfig } from '../src/auth/config';
import { parseTransferStatus, transferClient } from '../src/wallet/transfers';
import { TransferStore } from '../src/wallet/transfer-store';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function fixture() {
  const locator = { wallet_id: createResourceId('wallet'), wallet_account_id: createResourceId('walletAccount'),
    operation_id: createResourceId('operation'), network_id: 'eip155:84532' };
  const wire = { ...locator, userop_hash: `0x${'11'.repeat(32)}`, status: 'delivery_pending', historical_confirmation: null,
    settlement: 'not_assessed', send_enabled: false, funds_reserved: true };
  return { locator, wire };
}
describe('Transfer historical display client', () => {
  it.each(['held','expired','delivery_pending','confirmation_recorded','review_required','reconciled'])('reads %s without granting spending', status => {
    const f = fixture(), wire = { ...f.wire, status, funds_reserved: !['expired','reconciled'].includes(status),
      historical_confirmation: ['confirmation_recorded','review_required','reconciled'].includes(status)
        ? { transaction_hash: `0x${'22'.repeat(32)}`, outcome: 'execution_succeeded', recorded_at: 100 } : null };
    const result = parseTransferStatus(wire, f.locator, 1000);
    expect(result.status).toBe(status); expect(result.send_enabled).toBe(false); expect(result.settlement).toBe('not_assessed');
  });
  it('preserves a reverted outcome after releasing its reservation', () => {
    const f = fixture(), wire = { ...f.wire, status: 'reconciled', funds_reserved: false,
      historical_confirmation: { transaction_hash: `0x${'22'.repeat(32)}`, outcome: 'execution_reverted', recorded_at: 100 } };
    expect(parseTransferStatus(wire, f.locator, 1000).historical_confirmation?.outcome).toBe('execution_reverted');
    expect(() => parseTransferStatus({ ...wire, funds_reserved: true }, f.locator, 1000)).toThrow();
    expect(() => parseTransferStatus({ ...wire, historical_confirmation: null }, f.locator, 1000)).toThrow();
  });
  it.each(['wallet','account','operation','network','extra','send','settlement','reserve','history','hash','unknown'])(
    'rejects inconsistent %s', fault => {
      const f = fixture(), wire: Record<string, unknown> = { ...f.wire };
      if (fault === 'wallet') wire.wallet_id = createResourceId('wallet');
      if (fault === 'account') wire.wallet_account_id = createResourceId('walletAccount');
      if (fault === 'operation') wire.operation_id = createResourceId('operation');
      if (fault === 'network') wire.network_id = 'eip155:1';
      if (fault === 'extra') wire.signature = 'private';
      if (fault === 'send') wire.send_enabled = true;
      if (fault === 'settlement') wire.settlement = 'settled';
      if (fault === 'reserve') wire.funds_reserved = false;
      if (fault === 'history') wire.status = 'confirmation_recorded';
      if (fault === 'hash') wire.userop_hash = `0x${'00'.repeat(32)}`;
      if (fault === 'unknown') wire.status = 'paid';
      expect(() => parseTransferStatus(wire, f.locator)).toThrow();
    });
  it.each(['future','fractional','outcome','extra'])( 'rejects malformed confirmation %s', fault => {
    const f = fixture(), confirmation: Record<string, unknown> = { transaction_hash: `0x${'22'.repeat(32)}`, outcome: 'execution_reverted', recorded_at: 50 };
    if (fault === 'future') confirmation.recorded_at = 101;
    if (fault === 'fractional') confirmation.recorded_at = 1.5;
    if (fault === 'outcome') confirmation.outcome = 'paid';
    if (fault === 'extra') confirmation.signature = 'private';
    expect(() => parseTransferStatus({ ...f.wire, status: 'confirmation_recorded', historical_confirmation: confirmation }, f.locator, 100)).toThrow();
  });
  it('snapshots selection and makes a single no-store GET', async () => {
    const f = fixture(), original = { ...f.locator };
    const config = buildAuthConfig(parseEnvironment({ ...environments.staging, status: 'provisioned', firebase_project_id: 'v3-runtime-test' }), {
      apiKey: `AIza${'a'.repeat(35)}`, appId: '1:123:web:abcdef', turnstileSiteKey: `0x${'a'.repeat(22)}` }) as EnabledAuthConfig;
    const fetcher = vi.fn().mockResolvedValue(Response.json(f.wire)); vi.stubGlobal('fetch', fetcher);
    const client = transferClient(config, async () => { f.locator.operation_id = createResourceId('operation'); return 'synthetic-token'; });
    const result = await client.status(f.locator, new AbortController().signal);
    expect(result.operation_id).toBe(original.operation_id); expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toContain(`/accounts/${original.wallet_account_id}/transfers/${original.operation_id}`);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error' });
  });
});

function storeFixture() {
  const f = fixture(), value = parseTransferStatus(f.wire, f.locator);
  const session = { assertCurrent: vi.fn(), status: vi.fn(async () => value) };
  const capture = vi.fn(() => session), store = new TransferStore(capture);
  return { ...f, value, session, capture, store };
}
describe('Transfer status lifecycle', () => {
  it('is inert until an explicit read and prevents duplicate in-flight requests', async () => {
    const f = storeFixture(); expect(f.capture).not.toHaveBeenCalled();
    const task = f.store.read(f.locator); await f.store.read(f.locator); await task;
    expect(f.session.status).toHaveBeenCalledTimes(1); expect(f.store.snapshot().phase).toBe('ready');
  });
  it('clears historical data before refreshing and does not restore it on error', async () => {
    const f = storeFixture(); await f.store.read(f.locator);
    f.session.status.mockRejectedValueOnce(new Error('unavailable'));
    const task = f.store.read(f.locator); expect(f.store.snapshot().result).toBeNull(); await task;
    expect(f.store.snapshot()).toEqual({ phase: 'error', result: null });
  });
  it.each(['clear','invalidate','dispose'] as const)('discards late responses after %s', async action => {
    const f = storeFixture(); let resolve!: (value: typeof f.value) => void;
    f.session.status.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const task = f.store.read(f.locator); f.store[action](); resolve(f.value); await task;
    expect(f.store.snapshot().result).toBeNull();
    if (action === 'invalidate') { await f.store.read(f.locator); expect(f.session.status).toHaveBeenCalledTimes(1); }
  });
  it('rejects a session change during the status request', async () => {
    const f = storeFixture(); f.session.assertCurrent.mockImplementationOnce(() => undefined).mockImplementation(() => { throw new Error('session changed'); });
    await f.store.read(f.locator); expect(f.store.snapshot()).toEqual({ phase: 'error', result: null });
  });
});
