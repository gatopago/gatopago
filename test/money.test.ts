import { afterEach, describe, expect, it, vi } from 'vitest';
import { deploymentDocumentDigest } from '@gatopago/shared/v3/deployment';
import { writeMoneyDraft } from '@gatopago/shared/v3/money-review-record';
import { createResourceId } from '@gatopago/shared/v3/primitives';
import { moneyClient, parseMoneyPreparation, parseMoneyStatus } from '../src/wallet/money';
import { moneyFixture } from './money.fixture';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BrowserAuth } from '../src/auth/browser';
import { MoneyOperationReview } from '../src/wallet/MoneyOperationReview';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('Browser monetary consent reconstruction', () => {
  it('shows the resolved username beside the signed address and rejects a different address', () => {
    const f = moneyFixture('aave_withdraw_and_pay');
    const recipient = {
      username: 'alice',
      display_name: 'Alice',
      network_id: f.request.network_id,
      address: f.request.recipient_address!,
      verified_at: f.now,
      expires_at: f.now + 10,
    };
    const props = {
      runtime: {} as BrowserAuth,
      uid: 'synthetic',
      session: { environment: f.environment, assertCurrent() {} } as Awaited<
        ReturnType<BrowserAuth['money']>
      >,
      selected: f.selection,
      preparation: parseMoneyPreparation(f.wire, f.selection, f.request, f.environment),
      credentials: [],
      recipient,
      english: false,
      onClose() {},
    };
    const html = renderToStaticMarkup(createElement(MoneyOperationReview, props));
    expect(html).toContain('@alice');
    expect(html).toContain(f.request.recipient_address);
    expect(() =>
      renderToStaticMarkup(
        createElement(MoneyOperationReview, {
          ...props,
          recipient: { ...recipient, address: `0x${'ab'.repeat(20)}` },
        }),
      ),
    ).toThrow('Recipient');
  });
  it.each(['aave_supply', 'aave_withdraw', 'aave_withdraw_and_pay'] as const)(
    'rebuilds %s exactly without a signature or send grant',
    (kind) => {
      const f = moneyFixture(kind),
        parsed = parseMoneyPreparation(f.wire, f.selection, f.request, f.environment, f.now);
      expect(parsed.candidate).toEqual(f.candidate);
      expect(parsed.send_enabled).toBe(false);
      expect(parsed.candidate.operation.signature).toBe('0x');
    },
  );
  it.each([
    'wallet',
    'instance',
    'identity',
    'address',
    'network',
    'market',
    'amount',
    'recipient',
    'checksum',
    'digest',
    'expired',
    'future',
    'schema',
    'extra-field',
    'gas',
    'origin',
    'release',
  ])('rejects a changed %s before consent', (fault) => {
    const f = moneyFixture(fault === 'recipient' ? 'aave_withdraw_and_pay' : 'aave_supply');
    const wire = structuredClone(f.wire),
      selection = structuredClone(f.selection),
      intent = structuredClone(f.request);
    if (fault === 'wallet') wire.wallet_id = createResourceId('wallet');
    if (fault === 'instance') selection.wallet_account_id = createResourceId('walletAccount');
    if (fault === 'identity') selection.account_id = `0x${'22'.repeat(32)}`;
    if (fault === 'address') selection.address = `0x${'44'.repeat(20)}`;
    if (fault === 'network') selection.network_id = 'eip155:1';
    if (fault === 'market') selection.market.digest = `0x${'33'.repeat(32)}`;
    if (fault === 'amount') intent.amount_atomic = '20000001';
    if (fault === 'recipient') intent.recipient_address = `0x${'77'.repeat(20)}`;
    if (fault === 'checksum') wire.review_sha256 = `0x${'11'.repeat(32)}`;
    if (fault === 'digest') wire.consent_digest = `0x${'11'.repeat(32)}`;
    if (fault === 'schema') wire.money_schema_version = 2;
    if (fault === 'extra-field') Object.assign(wire, { calldata: '0x' });
    if (fault === 'origin') f.environment.web_origin = 'https://wrong.example';
    if (fault === 'release') intent.client_release_id = 'unsupported-release';
    if (fault === 'gas') selection.gas.limits.aave_supply.callGasLimit = '400001';
    expect(() =>
      parseMoneyPreparation(
        wire,
        selection,
        intent,
        f.environment,
        fault === 'expired' ? f.candidate.plan.validUntil : fault === 'future' ? f.now - 1 : f.now,
      ),
    ).toThrow();
  });
  it('can read an expired historical operation without restoring signatures or granting send', () => {
    const f = moneyFixture();
    vi.spyOn(Date, 'now').mockReturnValue((f.now + 60) * 1000);
    expect(parseMoneyStatus(f.status, f.selection, f.environment, f.operationId)).toMatchObject({
      state: 'authorized',
      funds_reserved: true,
      send_enabled: false,
    });
    expect(() => parseMoneyPreparation(f.wire, f.selection, f.request, f.environment)).toThrow();
  });
  it.each([
    'wrong-operation',
    'released-without-proof',
    'no-receipt',
    'state',
    'assertions',
    'dispatched-time',
    'conflict',
  ])('rejects inconsistent status %s', (fault) => {
    const f = moneyFixture(),
      status = structuredClone(f.status);
    if (fault === 'wrong-operation') status.operation_id = createResourceId('operation');
    if (fault === 'released-without-proof') status.funds_reserved = false;
    if (fault === 'no-receipt')
      Object.assign(status, {
        state: 'reconciled',
        funds_reserved: false,
        settlement: 'reconciled',
        dispatched_at: f.now,
      });
    if (fault === 'state') status.state = 'unknown';
    if (fault === 'dispatched-time')
      Object.assign(status, { state: 'dispatch_pending', dispatched_at: f.now - 1 });
    if (fault === 'conflict')
      Object.assign(status, {
        state: 'reconciled',
        funds_reserved: false,
        settlement: 'reconciled',
        evidence_conflict: true,
        dispatched_at: f.now,
      });
    if (fault === 'assertions') {
      const draft = writeMoneyDraft(f.review),
        row = JSON.parse(draft.json);
      row.proofs = [{ kind: 'webauthn', assertion: 'private' }];
      status.review_json = JSON.stringify(row);
      status.review_sha256 = deploymentDocumentDigest(status.review_json);
    }
    expect(() => parseMoneyStatus(status, f.selection, f.environment, f.operationId)).toThrow();
  });
});
describe('Monetary HTTP boundary', () => {
  it('sends one prepare request with its stable key, client headers and no-store', async () => {
    const f = moneyFixture(),
      fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.method).toBe('POST');
        expect(init?.cache).toBe('no-store');
        expect(init?.credentials).toBe('omit');
        expect(init?.redirect).toBe('error');
        expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('prepare-fixed');
        expect(JSON.parse(String(init?.body))).toEqual(f.request);
        return Response.json(f.wire);
      });
    vi.stubGlobal('fetch', fetcher);
    await moneyClient(f.config, async () => 'synthetic-token').prepare(
      f.selection,
      f.request,
      'prepare-fixed',
      new AbortController().signal,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('restores status with GET only, including after consent expires', async () => {
    const f = moneyFixture();
    vi.spyOn(Date, 'now').mockReturnValue((f.now + 60) * 1000);
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe('GET');
      expect(init?.body).toBeUndefined();
      return Response.json(f.status);
    });
    vi.stubGlobal('fetch', fetcher);
    await moneyClient(f.config, async () => 'synthetic-token').status(
      f.selection,
      f.operationId,
      new AbortController().signal,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('retains a confirmation timeout as uncertainty without retry', async () => {
    const f = moneyFixture(),
      prepared = parseMoneyPreparation(f.wire, f.selection, f.request, f.environment);
    const fetcher = vi.fn(async () => {
      throw new Error('timeout after request');
    });
    vi.stubGlobal('fetch', fetcher);
    await expect(
      moneyClient(f.config, async () => 'synthetic-token').confirm(
        f.selection,
        prepared,
        [{ signerIndex: 0, kind: 'webauthn', assertion: f.keys.assertion(f.candidate.digest) }],
        'confirm-fixed',
        new AbortController().signal,
      ),
    ).rejects.toThrow('timeout');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('refuses an expired review after token refresh before a confirmation fetch', async () => {
    const f = moneyFixture(),
      prepared = parseMoneyPreparation(f.wire, f.selection, f.request, f.environment),
      clock = vi.spyOn(Date, 'now').mockReturnValue(f.now * 1000);
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(
      moneyClient(f.config, async () => {
        clock.mockReturnValue(f.candidate.plan.validUntil * 1000);
        return 'synthetic-token';
      }).confirm(
        f.selection,
        prepared,
        [{ signerIndex: 0, kind: 'webauthn', assertion: f.keys.assertion(f.candidate.digest) }],
        'confirm-fixed',
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['confirm', 'deliver'] as const)(
    'refuses %s if recipient resolution expires during token refresh',
    async (kind) => {
      const f = moneyFixture('aave_withdraw_and_pay'),
        prepared = parseMoneyPreparation(f.wire, f.selection, f.request, f.environment),
        clock = vi.spyOn(Date, 'now').mockReturnValue(f.now * 1000),
        fetcher = vi.fn();
      vi.stubGlobal('fetch', fetcher);
      const client = moneyClient(f.config, async () => {
        clock.mockReturnValue((f.now + 1) * 1000);
        return 'synthetic-token';
      });
      const action =
        kind === 'confirm'
          ? client.confirm(
              f.selection,
              prepared,
              [
                {
                  signerIndex: 0,
                  kind: 'webauthn',
                  assertion: f.keys.assertion(f.candidate.digest),
                },
              ],
              'confirm-fixed',
              new AbortController().signal,
              f.now + 1,
            )
          : client.deliver(
              f.selection,
              prepared,
              f.operationId,
              new AbortController().signal,
              f.now + 1,
            );
      await expect(action).rejects.toThrow();
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
});
