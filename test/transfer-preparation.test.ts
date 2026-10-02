import { afterEach, describe, expect, it, vi } from 'vitest';
import { createResourceId } from '@gatopago/shared/v3/primitives';
import { CLIENT_RELEASE_ID } from '@gatopago/shared/v3/client-release';
import { writeTransferDraft, readTransferDraft } from '@gatopago/shared/v3/transfer-review-record';
import { deploymentDocumentDigest } from '@gatopago/shared/v3/deployment';
import environments from '@gatopago/environment/environments.json';
import { parseEnvironment } from '@gatopago/environment';
import { transferFixture } from '@gatopago/test-fixtures/v3-transfer';
import { buildAuthConfig, type EnabledAuthConfig } from '../src/auth/config';
import { parseTransferPreparation, transferPreparationClient } from '../src/wallet/transfer-preparation';
import { walletTransport } from '../src/wallet/http';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function fixture(native = true, max = false) {
  const f = transferFixture(native), request = { ...f.request, client_release_id: CLIENT_RELEASE_ID,
    amount: max ? { kind: 'max' as const } : f.request.amount };
  const draft = writeTransferDraft({ request, context: f.context, policy: f.approval.policy, scope: f.approval.scope, prepared_at: f.now });
  const candidate = readTransferDraft(draft.json, draft.digest).candidate;
  const selected = { wallet_id: request.wallet_id, wallet_account_id: createResourceId('walletAccount'), network_id: request.network_id,
    account_id: f.context.account_id, address: f.context.account,
    deployment: { document: f.approval.security_evidence.document, digest: f.context.deployment_digest } };
  const wire = { schema_version: 1, preparation_id: createResourceId('operation'), wallet_id: selected.wallet_id,
    wallet_account_id: selected.wallet_account_id, consent_digest: candidate.digest, review_json: draft.json, review_sha256: draft.digest,
    expires_at: candidate.plan.validUntil, send_enabled: false };
  const config = buildAuthConfig(parseEnvironment({ ...environments.production, status: 'provisioned', firebase_project_id: 'v3-runtime-test' }), {
    apiKey: `AIza${'a'.repeat(35)}`, appId: '1:123:web:abcdef', turnstileSiteKey: `0x${'a'.repeat(22)}` }) as EnabledAuthConfig;
  return { f, request, selected, wire, candidate, config };
}

describe('Consumer transfer preparation reconstruction', () => {
  it.each([[true,false],[false,false],[true,true],[false,true]])('rebuilds native=%s MAX=%s without a signing grant', (native,max) => {
    const x = fixture(native,max), result = parseTransferPreparation(x.wire,x.selected,x.request,parseEnvironment(environments.production),x.f.now);
    expect(result.candidate).toEqual(x.candidate); expect(result.send_enabled).toBe(false);
    expect(result.candidate.operation.signature).toBe('0x');
  });
  it.each(['wallet','instance','account','address','network','request','digest','checksum','expiry','future','expired','extra','send','id','environment','release'])(
    'rejects crossed or malformed %s', fault => {
      const x = fixture(), wire: Record<string,unknown> = { ...x.wire }, selected = structuredClone(x.selected), request = structuredClone(x.request);
      let now = x.f.now;
      if (fault === 'wallet') wire.wallet_id = createResourceId('wallet');
      if (fault === 'instance') wire.wallet_account_id = createResourceId('walletAccount');
      if (fault === 'account') selected.account_id = `0x${'22'.repeat(32)}`;
      if (fault === 'address') selected.address = `0x${'22'.repeat(20)}`;
      if (fault === 'network') selected.network_id = 'eip155:1';
      if (fault === 'request') request.amount = { kind: 'exact', amount_atomic: '20' };
      if (fault === 'digest') wire.consent_digest = `0x${'22'.repeat(32)}`;
      if (fault === 'checksum') wire.review_sha256 = `0x${'22'.repeat(32)}`;
      if (fault === 'expiry') wire.expires_at = x.wire.expires_at + 1;
      if (fault === 'future') now--;
      if (fault === 'expired') now = x.wire.expires_at;
      if (fault === 'extra') wire.signature = 'not accepted';
      if (fault === 'send') wire.send_enabled = true;
      if (fault === 'id') wire.preparation_id = createResourceId('operation');
      if (fault === 'release') request.client_release_id = 'other-release';
      const environment = parseEnvironment({ ...environments.production, ...(fault === 'environment'
        ? { web_origin: 'https://other.gatopago.com', webauthn_rp_id: 'other.gatopago.com', webauthn_allowed_origins: ['https://other.gatopago.com'] } : {}) });
      expect(() => parseTransferPreparation(wire,selected,request,environment,now,x.wire.preparation_id)).toThrow();
    });
  it('rejects extra nested data even after the transport checksum is recomputed', () => {
    const x = fixture(), root = JSON.parse(x.wire.review_json); root.context.router = 'injected';
    const json = JSON.stringify(root);
    expect(() => parseTransferPreparation({ ...x.wire, review_json: json, review_sha256: deploymentDocumentDigest(json) },
      x.selected,x.request,parseEnvironment(environments.production),x.f.now)).toThrow();
  });
  it.each(['prepare','read'] as const)('uses one bounded %s request with captured input', async method => {
    const x = fixture(); vi.spyOn(Date, 'now').mockReturnValue(x.f.now * 1000);
    const fetcher = vi.fn().mockResolvedValue(Response.json(x.wire)); vi.stubGlobal('fetch',fetcher);
    const client = transferPreparationClient(x.config,async () => { x.selected.wallet_account_id = createResourceId('walletAccount'); x.request.amount = { kind: 'max' }; return 'synthetic'; });
    const result = method === 'prepare' ? await client.prepare(x.selected,x.request,new AbortController().signal)
      : await client.read(x.selected,x.request,x.wire.preparation_id,new AbortController().signal);
    expect(result.preparation_id).toBe(x.wire.preparation_id); expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toContain(`/accounts/${x.wire.wallet_account_id}/transfer-preparations`);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: method === 'prepare' ? 'POST' : 'GET', cache: 'no-store', redirect: 'error', credentials: 'omit' });
  });
  it('rejects a bad release before acquiring any token or making a request', async () => {
    const x = fixture(), token = vi.fn();
    await expect(transferPreparationClient(x.config,token).prepare(x.selected,{ ...x.request,client_release_id:'old' },new AbortController().signal)).rejects.toThrow();
    expect(token).not.toHaveBeenCalled();
  });
  it('rejects cancellation before acquiring any token', async () => {
    const x = fixture(), token = vi.fn(), controller = new AbortController(); controller.abort();
    await expect(transferPreparationClient(x.config,token).prepare(x.selected,x.request,controller.signal)).rejects.toThrow();
    expect(token).not.toHaveBeenCalled();
  });
  it('keeps large-response admission restricted to the transfer transport profile', async () => {
    const x = fixture(); vi.stubGlobal('fetch',vi.fn().mockImplementation(() => Promise.resolve(Response.json({ padding: 'x'.repeat(40_000) }))));
    await expect(walletTransport(x.config,async () => 'synthetic',new AbortController().signal).request('/session','GET')).rejects.toThrow();
    const result = await walletTransport(x.config,async () => 'synthetic',new AbortController().signal,'transfer-preparation').request('/session','GET');
    expect(result.status).toBe(200);
  });
  it('still bounds the transfer response and does not retry it', async () => {
    const x = fixture(), fetcher = vi.fn().mockResolvedValue(Response.json({ padding: 'x'.repeat(1_000_001) })); vi.stubGlobal('fetch',fetcher);
    await expect(walletTransport(x.config,async () => 'synthetic',new AbortController().signal,'transfer-preparation').request('/session','GET')).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
