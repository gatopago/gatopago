import { afterEach, describe, expect, it, vi } from 'vitest';
import { createResourceId } from '@gatopago/shared/v3/primitives';
import { CLIENT_RELEASE_ID } from '@gatopago/shared/v3/client-release';
import { writeTransferDraft, readTransferDraft } from '@gatopago/shared/v3/transfer-review-record';
import environments from '@gatopago/environment/environments.json';
import { parseEnvironment } from '@gatopago/environment';
import { transferFixture } from '@gatopago/test-fixtures/v3-transfer';
import { buildAuthConfig, type EnabledAuthConfig } from '../src/auth/config';
import {
  parseTransferRestoration,
  transferRestorationClient,
} from '../src/wallet/transfer-restoration';
import {
  parseTransferBookmark,
  transferBookmarkHash,
  saveTransferBookmark,
  clearTransferBookmark,
  subscribeTransferBookmark,
  transferBookmarkSnapshot,
  transferBookmarkServerSnapshot,
} from '../src/wallet/transfer-bookmark';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function fixture(max = false, release = CLIENT_RELEASE_ID, native = false) {
  const f = transferFixture(native),
    request = {
      ...f.request,
      client_release_id: release,
      amount: max ? { kind: 'max' as const } : f.request.amount,
    };
  const draft = writeTransferDraft({
    request,
    context: f.context,
    policy: f.approval.policy,
    scope: f.approval.scope,
    prepared_at: f.now,
  });
  const candidate = readTransferDraft(draft.json, draft.digest).candidate;
  const selected = {
    wallet_id: request.wallet_id,
    wallet_account_id: createResourceId('walletAccount'),
    network_id: request.network_id,
    account_id: f.context.account_id,
    address: f.context.account,
    deployment: {
      document: f.approval.security_evidence.document,
      digest: f.context.deployment_digest,
    },
  };
  const bookmark = {
    wallet_id: selected.wallet_id,
    wallet_account_id: selected.wallet_account_id,
    network_id: selected.network_id,
    consent_digest: candidate.digest,
    expires_at: candidate.plan.validUntil,
  };
  const status = {
    wallet_id: selected.wallet_id,
    wallet_account_id: selected.wallet_account_id,
    network_id: selected.network_id,
    operation_id: createResourceId('operation'),
    userop_hash: candidate.userOpHash,
    status: 'held',
    historical_confirmation: null,
    funds_reserved: true,
    settlement: 'not_assessed',
    send_enabled: false,
  };
  const asset_metadata = [...new Set([request.asset_id, f.context.native_asset_id])].map(
    (asset_id) => ({
      asset_id,
      symbol: asset_id === f.context.native_asset_id ? 'ETH' : 'USDC',
      decimals: asset_id === f.context.native_asset_id ? 18 : 6,
    }),
  );
  const wire = {
    schema_version: 1,
    consent_digest: candidate.digest,
    review_json: draft.json,
    review_sha256: draft.digest,
    status,
    checked_at: f.now,
    asset_metadata,
  };
  const config = buildAuthConfig(
    parseEnvironment({
      ...environments.production,
      status: 'provisioned',
      firebase_project_id: 'v3-runtime-test',
    }),
    {
      apiKey: `AIza${'a'.repeat(35)}`,
      appId: '1:123:web:abcdef',
      turnstileSiteKey: `0x${'a'.repeat(22)}`,
    },
  ) as EnabledAuthConfig;
  const clock = vi.spyOn(Date, 'now').mockReturnValue(f.now * 1000),
    token = vi.fn(async () => 'synthetic-token');
  const client = transferRestorationClient(config, token);
  return { f, request, selected, bookmark, status, wire, candidate, config, clock, token, client };
}
function statusWire(x: ReturnType<typeof fixture>, state: string) {
  return {
    ...x.wire,
    status: {
      ...x.status,
      status: state,
      funds_reserved: state !== 'expired' && state !== 'reconciled',
      historical_confirmation: ['reconciled', 'confirmation_recorded', 'review_required'].includes(
        state,
      )
        ? {
            transaction_hash: `0x${'ab'.repeat(32)}`,
            outcome: 'execution_succeeded',
            recorded_at: x.f.now,
          }
        : null,
    },
  };
}

describe('Read-only transfer restoration', () => {
  it.each([
    'held',
    'expired',
    'delivery_pending',
    'confirmation_recorded',
    'review_required',
    'reconciled',
  ])('rebuilds the same unsigned %s operation, including after expiry', (state) => {
    const x = fixture(),
      wire = statusWire(x, state);
    x.clock.mockReturnValue((x.bookmark.expires_at + 1) * 1000);
    const result = parseTransferRestoration(wire, x.selected, x.bookmark, x.config.deployment);
    expect(result.transfer?.candidate.digest).toBe(x.candidate.digest);
    expect(result.transfer?.status.operation_id).toBe(x.status.operation_id);
    expect(result.transfer?.candidate.operation.signature).toBe('0x');
    expect(result.transfer?.status.status).toBe(state);
  });
  it('restores the exact resolved MAX amount from the unsigned review', () => {
    const x = fixture(true),
      result = parseTransferRestoration(x.wire, x.selected, x.bookmark, x.config.deployment);
    expect(result.transfer?.candidate.request.amount.kind).toBe('max');
    expect(result.transfer?.candidate.funding.amount_atomic).toBe(
      x.candidate.funding.amount_atomic,
    );
    expect(BigInt(result.transfer!.candidate.funding.amount_atomic)).toBeGreaterThan(0n);
  });
  it('uses one captured native-asset record for both amount and fees, without a balance observation', () => {
    const x = fixture(false, CLIENT_RELEASE_ID, true),
      result = parseTransferRestoration(x.wire, x.selected, x.bookmark, x.config.deployment);
    expect(result.transfer?.metadata).toEqual([
      { asset_id: x.request.asset_id, symbol: 'ETH', decimals: 18 },
    ]);
    x.wire.asset_metadata[0].decimals = 6;
    expect(result.transfer?.metadata[0].decimals).toBe(18);
    expect(Object.isFrozen(result.transfer?.metadata)).toBe(true);
    expect(result.transfer).not.toHaveProperty('balance');
  });
  it('keeps missing reservation distinct from a failed or successful transfer', () => {
    const x = fixture(),
      result = parseTransferRestoration(
        { ...x.wire, status: null, review_json: null, review_sha256: null, asset_metadata: null },
        x.selected,
        x.bookmark,
        x.config.deployment,
      );
    expect(result.transfer).toBeNull();
    expect(result.checked_at).toBe(x.f.now);
  });
  it.each(['missing', 'duplicate', 'network', 'asset', 'decimals', 'symbol', 'extra'] as const)(
    'rejects malformed %s display metadata before delivery',
    async (fault) => {
      const x = fixture(),
        metadata = structuredClone(x.wire.asset_metadata);
      if (fault === 'missing') metadata.pop();
      if (fault === 'duplicate') metadata[1] = { ...metadata[0] };
      if (fault === 'network') metadata[0].asset_id = 'eip155:1/slip44:60';
      if (fault === 'asset')
        metadata[0].asset_id = `${x.selected.network_id}/erc20:0x${'ef'.repeat(20)}`;
      if (fault === 'decimals') metadata[0].decimals = -1;
      if (fault === 'symbol') metadata[0].symbol = '<script>';
      const wire = {
        ...x.wire,
        asset_metadata:
          fault === 'extra' ? metadata.map((a) => ({ ...a, amount_atomic: '100' })) : metadata,
      };
      expect(() =>
        parseTransferRestoration(wire, x.selected, x.bookmark, x.config.deployment),
      ).toThrow();
      vi.stubGlobal('fetch', vi.fn());
      await expect(
        x.client.deliver(x.selected, x.bookmark, wire, new AbortController().signal),
      ).rejects.toThrow();
      expect(x.token).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it.each([
    'wallet',
    'account',
    'network',
    'digest',
    'expiry',
    'checksum',
    'operation',
    'userop',
    'future',
    'extra',
    'signed',
    'partial-null',
  ])('rejects a crossed or malformed %s restore response', (fault) => {
    const x = fixture(),
      wire: Record<string, unknown> = structuredClone(x.wire),
      bookmark = { ...x.bookmark };
    if (fault === 'wallet') bookmark.wallet_id = createResourceId('wallet');
    if (fault === 'account') bookmark.wallet_account_id = createResourceId('walletAccount');
    if (fault === 'network') bookmark.network_id = 'eip155:1';
    if (fault === 'digest') wire.consent_digest = `0x${'ab'.repeat(32)}`;
    if (fault === 'expiry') bookmark.expires_at++;
    if (fault === 'checksum') wire.review_sha256 = `0x${'ab'.repeat(32)}`;
    if (fault === 'operation') wire.status = { ...x.status, operation_id: 'invalid' };
    if (fault === 'userop') wire.status = { ...x.status, userop_hash: `0x${'ab'.repeat(32)}` };
    if (fault === 'future') wire.checked_at = x.f.now + 10;
    if (fault === 'extra') wire.claim_token = 'not allowed';
    if (fault === 'signed') wire.status = { ...x.status, send_enabled: true };
    if (fault === 'partial-null') wire.status = null;
    expect(() =>
      parseTransferRestoration(wire, x.selected, bookmark, x.config.deployment),
    ).toThrow();
  });
  it('uses a single authenticated GET with no body, proof, cookie or automatic mutation', async () => {
    const x = fixture(),
      fetcher = vi.fn(async () => Response.json(x.wire));
    vi.stubGlobal('fetch', fetcher);
    expect(
      (await x.client.restore(x.selected, x.bookmark, new AbortController().signal)).transfer
        ?.status.operation_id,
    ).toBe(x.status.operation_id);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`/transfer-consents/${x.candidate.digest}`);
    expect(options).toMatchObject({
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
    });
    expect(options.body).toBeUndefined();
  });
  it('captures locator values before token acquisition', async () => {
    const x = fixture(),
      fetcher = vi.fn(async () => Response.json(x.wire));
    vi.stubGlobal('fetch', fetcher);
    x.token.mockImplementation(async () => {
      x.bookmark.wallet_id = createResourceId('wallet');
      x.selected.wallet_account_id = createResourceId('walletAccount');
      return 'synthetic-token';
    });
    expect(
      (await x.client.restore(x.selected, x.bookmark, new AbortController().signal)).transfer
        ?.status.operation_id,
    ).toBe(x.status.operation_id);
  });
  it.each([
    'held',
    'delivery_pending',
    'reconciled',
    'expired',
    'review_required',
    'confirmation_recorded',
  ])('only explicit held delivery can issue a POST: %s', async (state) => {
    const x = fixture(),
      fetcher = vi.fn(async () =>
        Response.json(
          {
            operation_id: x.status.operation_id,
            userop_hash: x.candidate.userOpHash,
            delivery: 'accepted',
            settlement: 'unconfirmed',
          },
          { status: 202 },
        ),
      );
    vi.stubGlobal('fetch', fetcher);
    const task = x.client.deliver(
      x.selected,
      x.bookmark,
      statusWire(x, state),
      new AbortController().signal,
    );
    if (state === 'held') {
      expect(await task).toMatchObject({ delivery: 'accepted' });
      expect(fetcher).toHaveBeenCalledTimes(1);
      const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toContain(`/transfers/${x.status.operation_id}/deliver`);
      expect(JSON.parse(String(init.body))).toEqual({ consent_digest: x.candidate.digest });
    } else {
      await expect(task).rejects.toThrow();
      expect(x.token).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
    }
  });
  it.each(['expired', 'outdated', 'missing'])(
    'does not dispatch %s consent and obtains no token',
    async (fault) => {
      const x = fixture(false, fault === 'outdated' ? 'v3-old-release' : CLIENT_RELEASE_ID);
      vi.stubGlobal('fetch', vi.fn());
      if (fault === 'expired') x.clock.mockReturnValue(x.bookmark.expires_at * 1000);
      const wire =
        fault === 'missing'
          ? {
              ...x.wire,
              status: null,
              review_json: null,
              review_sha256: null,
              asset_metadata: null,
            }
          : x.wire;
      await expect(
        x.client.deliver(x.selected, x.bookmark, wire, new AbortController().signal),
      ).rejects.toThrow();
      expect(x.token).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it('rechecks expiry after token acquisition', async () => {
    const x = fixture();
    vi.stubGlobal('fetch', vi.fn());
    x.token.mockImplementation(async () => {
      x.clock.mockReturnValue(x.bookmark.expires_at * 1000);
      return 'synthetic-token';
    });
    await expect(
      x.client.deliver(x.selected, x.bookmark, x.wire, new AbortController().signal),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not retry a lost delivery response or turn it into a success', async () => {
    const x = fixture(),
      fetcher = vi.fn(async () => {
        throw new Error('response lost');
      });
    vi.stubGlobal('fetch', fetcher);
    await expect(
      x.client.deliver(x.selected, x.bookmark, x.wire, new AbortController().signal),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('Non-authorizing reload locator', () => {
  it('retains only the account, network, digest and expiry', () => {
    const x = fixture(),
      hash = transferBookmarkHash(x.bookmark),
      result = parseTransferBookmark(hash);
    expect(result).toEqual(x.bookmark);
    expect(Object.keys(result!).sort()).toEqual([
      'consent_digest',
      'expires_at',
      'network_id',
      'wallet_account_id',
      'wallet_id',
    ]);
    expect(hash).not.toContain(x.request.destination.address);
    expect(hash).not.toContain('signature');
    expect(transferBookmarkServerSnapshot()).toBe('');
    expect(parseTransferBookmark('#other-anchor')).toBeNull();
  });
  it.each(['extra', 'expiry', 'digest', 'wallet', 'encoding', 'oversize'])(
    'rejects a malformed %s bookmark',
    (fault) => {
      const x = fixture(),
        value: Record<string, unknown> = { ...x.bookmark };
      if (fault === 'extra') value.signature = 'unexpected';
      if (fault === 'expiry') value.expires_at = -1;
      if (fault === 'digest') value.consent_digest = 'invalid';
      if (fault === 'wallet') value.wallet_id = 'invalid';
      const hash =
        fault === 'encoding'
          ? '#transfer-v3=%FF'
          : fault === 'oversize'
            ? '#transfer-v3=' + 'x'.repeat(1025)
            : '#transfer-v3=' + encodeURIComponent(JSON.stringify(value));
      expect(() => parseTransferBookmark(hash)).toThrow();
    },
  );
  it('preserves history state, notifies subscribers, and refuses to overwrite a pending operation', () => {
    const x = fixture(),
      events = new EventTarget(),
      location = { hash: '', pathname: '/send', search: '?username=alice' },
      state = { next: 'retained' };
    const replaceState = vi.fn((_state: unknown, _unused: string, url: string) => {
      location.hash = url.includes('#') ? url.slice(url.indexOf('#')) : '';
    });
    vi.stubGlobal('window', {
      location,
      history: { state, replaceState },
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
      dispatchEvent: events.dispatchEvent.bind(events),
    });
    const listener = vi.fn(),
      unsubscribe = subscribeTransferBookmark(listener);
    saveTransferBookmark(x.bookmark);
    expect(transferBookmarkSnapshot()).toBe(transferBookmarkHash(x.bookmark));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(replaceState.mock.calls[0][0]).toBe(state);
    expect(replaceState.mock.calls[0][2]).toContain('/send?username=alice#');
    expect(() =>
      saveTransferBookmark({ ...x.bookmark, consent_digest: `0x${'ab'.repeat(32)}` }),
    ).toThrow();
    expect(() =>
      clearTransferBookmark({ ...x.bookmark, expires_at: x.bookmark.expires_at + 1 }),
    ).toThrow();
    clearTransferBookmark(x.bookmark);
    expect(location.hash).toBe('');
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    events.dispatchEvent(new Event('hashchange'));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
