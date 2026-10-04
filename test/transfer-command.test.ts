import { afterEach, describe, expect, it, vi } from 'vitest';
import { createResourceId } from '@gatopago/shared/v3/primitives';
import { CLIENT_RELEASE_ID } from '@gatopago/shared/v3/client-release';
import { writeTransferDraft, readTransferDraft } from '@gatopago/shared/v3/transfer-review-record';
import { parseTransferConfirmation, serializeTransferConfirmation } from '@gatopago/shared/v3/transfer-wire';
import { parseEnvironment } from '@gatopago/environment';
import environments from '@gatopago/environment/environments.json';
import { transferFixture } from '@gatopago/test-fixtures/v3-transfer';
import { buildAuthConfig, type EnabledAuthConfig } from '../src/auth/config';
import { parseTransferPreparation } from '../src/wallet/transfer-preparation';
import { parseTransferConfirmationReceipt, parseTransferDeliveryReceipt, transferCommandClient } from '../src/wallet/transfer-command';
import { TransferExecutionFlow } from '../src/wallet/transfer-execution-flow';
import { parseTransferStatus } from '../src/wallet/transfers';
import { isReloadBlocked } from '../src/pwa/reload-guard';
import { TransferSigning } from '../src/wallet/transfer-signing';
import { parseCredentialDetail } from '@gatopago/shared/v3/credential-detail';
import { TransferReview } from '../src/wallet/TransferReview';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function fixture(native = true, max = false) {
  const f = transferFixture(native), request = { ...f.request, client_release_id: CLIENT_RELEASE_ID,
    amount: max ? { kind: 'max' as const } : f.request.amount };
  const draft = writeTransferDraft({ request, context: f.context, policy: f.approval.policy, scope: f.approval.scope, prepared_at: f.now });
  const candidate = readTransferDraft(draft.json,draft.digest).candidate;
  const selected = { wallet_id: request.wallet_id, wallet_account_id: createResourceId('walletAccount'), network_id: request.network_id,
    account_id: f.context.account_id, address: f.context.account,
    deployment: { document: f.approval.security_evidence.document, digest: f.context.deployment_digest } };
  const wire = { schema_version: 1, preparation_id: createResourceId('operation'), wallet_id: selected.wallet_id,
    wallet_account_id: selected.wallet_account_id, consent_digest: candidate.digest, review_json: draft.json, review_sha256: draft.digest,
    expires_at: candidate.plan.validUntil, send_enabled: false };
  const config = buildAuthConfig(parseEnvironment({ ...environments.production, status: 'provisioned', firebase_project_id: 'v3-runtime-test' }), {
    apiKey: `AIza${'a'.repeat(35)}`, appId: '1:123:web:abcdef', turnstileSiteKey: `0x${'a'.repeat(22)}` }) as EnabledAuthConfig;
  const review = { wire }, preparation = parseTransferPreparation(wire,selected,request,parseEnvironment(environments.production),f.now);
  const confirmation = { id: createResourceId('operation'),state:'held' as const,expires_at:wire.expires_at,
    send_enabled:false,preparation_id:wire.preparation_id,consent_digest:candidate.digest };
  const delivery = { operation_id:confirmation.id,userop_hash:candidate.userOpHash,delivery:'accepted',settlement:'unconfirmed' };
  const clock = vi.spyOn(Date,'now').mockReturnValue(f.now * 1000), token = vi.fn(async () => 'synthetic-token');
  const client = transferCommandClient(config,token);
  return { f,request,selected,candidate,config,review,preparation,confirmation,delivery,clock,token,client };
}

describe('Consumer explicit transfer commands', () => {
  it.each([[true,false],[false,false],[true,true],[false,true]])('verifies actual synthetic signatures before confirming native=%s MAX=%s', async (native,max) => {
    const x = fixture(native,max), proofs = await x.f.proofs(x.candidate.digest);
    const fetcher = vi.fn().mockResolvedValue(Response.json(x.confirmation)); vi.stubGlobal('fetch',fetcher);
    expect(await x.client.confirm(x.selected,x.request,x.review,proofs,new AbortController().signal)).toEqual(x.confirmation);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url,init] = fetcher.mock.calls[0];
    expect(url).toContain(`/transfer-preparations/${x.review.wire.preparation_id}/confirm`);
    expect(init).toMatchObject({ method:'POST',credentials:'omit',redirect:'error',cache:'no-store' });
    expect(parseTransferConfirmation(JSON.parse(init.body)).proofs).toEqual(proofs);
    expect(Object.keys(JSON.parse(init.body)).sort()).toEqual(['consent_digest','proofs']);
  });
  it('serializes isolated bounded public proofs, not private signing state', async () => {
    const x = fixture(), proofs = await x.f.proofs(x.candidate.digest), wire = serializeTransferConfirmation(x.candidate.digest,proofs);
    const decoded = parseTransferConfirmation(wire); expect(decoded.proofs).toEqual(proofs);
    const p = proofs.find(p => p.kind === 'webauthn')!; p.assertion.authenticatorData.fill(0);
    expect(parseTransferConfirmation(wire)).toEqual(decoded);
    expect(() => serializeTransferConfirmation(x.candidate.digest,[])).toThrow();
    expect(() => serializeTransferConfirmation(x.candidate.digest,[proofs[0],proofs[0]])).toThrow();
  });
  it('rejects valid signatures for a different digest before any token or request', async () => {
    const x = fixture(), proofs = await x.f.proofs(`0x${'22'.repeat(32)}`); vi.stubGlobal('fetch',vi.fn());
    await expect(x.client.confirm(x.selected,x.request,x.review,proofs,new AbortController().signal)).rejects.toThrow();
    expect(x.token).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects expiry during token acquisition without transmitting signatures', async () => {
    const x = fixture(), proofs = await x.f.proofs(x.candidate.digest); vi.stubGlobal('fetch',vi.fn());
    x.token.mockImplementation(async () => { x.clock.mockReturnValue(x.confirmation.expires_at * 1000); return 'synthetic-token'; });
    await expect(x.client.confirm(x.selected,x.request,x.review,proofs,new AbortController().signal)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('snapshots selection, review and proofs before asynchronous verification', async () => {
    const x = fixture(), proofs = await x.f.proofs(x.candidate.digest), originalId = x.review.wire.preparation_id;
    const fetcher = vi.fn().mockResolvedValue(Response.json(x.confirmation)); vi.stubGlobal('fetch',fetcher);
    const task = x.client.confirm(x.selected,x.request,x.review,proofs,new AbortController().signal);
    x.selected.wallet_account_id = createResourceId('walletAccount'); x.review.wire.preparation_id = createResourceId('operation');
    x.request.amount = { kind:'max' }; proofs.splice(0);
    expect((await task).preparation_id).toBe(originalId); expect(fetcher.mock.calls[0][0]).toContain(originalId);
  });
  it.each(['held','delivery_pending','reconciled'] as const)('accepts confirmation state %s without claiming settlement', state => {
    const x = fixture(); expect(parseTransferConfirmationReceipt({ ...x.confirmation,state },x.preparation)).toMatchObject({ state,send_enabled:false });
  });
  it.each(['id','preparation','digest','expiry','state','send','extra'])( 'rejects malformed confirmation %s', fault => {
    const x = fixture(), wire: Record<string,unknown> = { ...x.confirmation };
    if (fault === 'id') wire.id = 'invalid';
    if (fault === 'preparation') wire.preparation_id = createResourceId('operation');
    if (fault === 'digest') wire.consent_digest = `0x${'22'.repeat(32)}`;
    if (fault === 'expiry') wire.expires_at = x.confirmation.expires_at + 1;
    if (fault === 'state') wire.state = 'paid';
    if (fault === 'send') wire.send_enabled = true;
    if (fault === 'extra') wire.claim_token = 'unexpected';
    expect(() => parseTransferConfirmationReceipt(wire,x.preparation)).toThrow();
  });
  it.each(['accepted','uncertain'])('delivers once and preserves %s as unconfirmed', async delivery => {
    const x = fixture(), fetcher = vi.fn().mockResolvedValue(Response.json({ ...x.delivery,delivery },{ status:202 })); vi.stubGlobal('fetch',fetcher);
    expect(await x.client.deliver(x.selected,x.request,x.review,x.confirmation,new AbortController().signal)).toMatchObject({ delivery,settlement:'unconfirmed' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toContain(`/transfers/${x.confirmation.id}/deliver`);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ consent_digest:x.candidate.digest });
  });
  it.each(['delivery_pending','reconciled'])('never redispatches an already %s confirmation', async state => {
    const x = fixture(); vi.stubGlobal('fetch',vi.fn());
    await expect(x.client.deliver(x.selected,x.request,x.review,{ ...x.confirmation,state },new AbortController().signal)).rejects.toThrow();
    expect(x.token).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['operation','hash','delivery','settlement','extra'])('rejects wrong delivery receipt %s', fault => {
    const x = fixture(), wire: Record<string,unknown> = { ...x.delivery };
    if (fault === 'operation') wire.operation_id = createResourceId('operation');
    if (fault === 'hash') wire.userop_hash = `0x${'22'.repeat(32)}`;
    if (fault === 'delivery') wire.delivery = 'paid';
    if (fault === 'settlement') wire.settlement = 'settled';
    if (fault === 'extra') wire.signature = 'unexpected';
    expect(() => parseTransferDeliveryReceipt(wire,x.confirmation.id,x.candidate.userOpHash)).toThrow();
  });
  it('does not retry a lost delivery response', async () => {
    const x = fixture(), fetcher = vi.fn().mockRejectedValue(new Error('connection lost')); vi.stubGlobal('fetch',fetcher);
    await expect(x.client.deliver(x.selected,x.request,x.review,x.confirmation,new AbortController().signal)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('keeps a late accepted delivery receipt without treating expiry as proof of failure', async () => {
    const x = fixture(); vi.stubGlobal('fetch',vi.fn(async () => {
      x.clock.mockReturnValue((x.confirmation.expires_at + 1) * 1000); return Response.json(x.delivery,{ status:202 });
    }));
    expect(await x.client.deliver(x.selected,x.request,x.review,x.confirmation,new AbortController().signal)).toMatchObject({ delivery:'accepted',settlement:'unconfirmed' });
  });
  it('honors an already aborted command before token acquisition', async () => {
    const x = fixture(), controller = new AbortController(); controller.abort();
    await expect(x.client.confirm(x.selected,x.request,x.review,[],controller.signal)).rejects.toThrow();
    await expect(x.client.deliver(x.selected,x.request,x.review,x.confirmation,controller.signal)).rejects.toThrow();
    expect(x.token).not.toHaveBeenCalled();
  });
});

function flowFixture() {
  const x = fixture(); vi.stubGlobal('window',{});
  const commands = { assertCurrent:vi.fn(),confirm:vi.fn(async () => parseTransferConfirmationReceipt(x.confirmation,x.preparation)),
    deliver:vi.fn(async () => parseTransferDeliveryReceipt(x.delivery,x.confirmation.id,x.candidate.userOpHash)) };
  const locator = { wallet_id:x.selected.wallet_id,wallet_account_id:x.selected.wallet_account_id,network_id:x.selected.network_id,operation_id:x.confirmation.id };
  const status = parseTransferStatus({ ...locator,userop_hash:x.candidate.userOpHash,status:'held',historical_confirmation:null,
    funds_reserved:true,settlement:'not_assessed',send_enabled:false },locator,x.f.now);
  const transfers = { assertCurrent:vi.fn(),status:vi.fn(async () => status) };
  const capture = vi.fn(() => ({ commands,transfers }));
  const flow = new TransferExecutionFlow(capture,x.selected,x.request,x.review,parseEnvironment(environments.production));
  return { ...x,commands,transfers,capture,flow,status };
}
function deferred<T>() { let resolve!: (value:T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise,resolve }; }

describe('Transfer execution lifecycle (commands mocked)', () => {
  it('retains its non-authorizing locator before the confirmation command', async () => {
    const x = flowFixture(), order:string[] = [];
    const flow = new TransferExecutionFlow(x.capture,x.selected,x.request,x.review,parseEnvironment(environments.production),() => { order.push('bookmark'); });
    x.commands.confirm.mockImplementation(async () => { order.push('confirm'); return parseTransferConfirmationReceipt(x.confirmation,x.preparation); });
    await flow.confirm([]); expect(order).toEqual(['bookmark','confirm']); expect(flow.snapshot().phase).toBe('reserved');
    flow.dispose(); x.flow.dispose();
  });
  it('does not confirm if its locator cannot be retained', async () => {
    const x = flowFixture(), flow = new TransferExecutionFlow(x.capture,x.selected,x.request,x.review,parseEnvironment(environments.production),() => { throw new Error('History unavailable'); });
    await flow.confirm([]); expect(x.commands.confirm).not.toHaveBeenCalled(); expect(flow.canEdit()).toBe(true);
    expect(flow.snapshot()).toMatchObject({ phase:'ready',error:true,confirmation:null }); flow.dispose(); x.flow.dispose();
  });
  it('permits background tracking only after receipt-backed delivery, never uncertain confirmation replay', async () => {
    const x = flowFixture(); expect(x.flow.canTrack()).toBe(false);
    x.commands.confirm.mockRejectedValueOnce(new Error('lost confirmation'));
    await x.flow.confirm([]); expect(x.flow.canTrack()).toBe(false);
    await x.flow.confirm([]); expect(x.flow.canTrack()).toBe(false);
    x.commands.deliver.mockRejectedValueOnce(new Error('lost delivery'));
    await x.flow.deliver(); expect(x.flow.canTrack()).toBe(true);
    await x.flow.readStatus(); expect(x.flow.canTrack()).toBe(true);
    expect(x.commands.confirm).toHaveBeenCalledTimes(2); expect(x.commands.deliver).toHaveBeenCalledTimes(1);
    x.flow.dispose(); expect(x.flow.canTrack()).toBe(false);
  });
  it.each(['reconciled','expired','review_required'] as const)('stops tracking a verified %s result', async status => {
    const x = flowFixture(); await x.flow.confirm([]); await x.flow.deliver(); expect(x.flow.canTrack()).toBe(true);
    x.transfers.status.mockResolvedValueOnce({ ...x.status, status, funds_reserved: status === 'review_required',
      historical_confirmation: status === 'expired' ? null : { transaction_hash: `0x${'ab'.repeat(32)}`, outcome: 'execution_succeeded', recorded_at: x.f.now } });
    await x.flow.readStatus(); expect(x.flow.canTrack()).toBe(false);
    expect(x.commands.confirm).toHaveBeenCalledTimes(1); expect(x.commands.deliver).toHaveBeenCalledTimes(1); x.flow.dispose();
  });
  it('stops automatic tracking on a read error and leaves retry explicit', async () => {
    const x = flowFixture(); await x.flow.confirm([]); await x.flow.deliver();
    x.transfers.status.mockRejectedValueOnce(new Error('read failed')); await x.flow.readStatus(); expect(x.flow.canTrack()).toBe(false);
    await x.flow.readStatus(); expect(x.flow.canTrack()).toBe(true); x.flow.invalidate(); expect(x.flow.canTrack()).toBe(false);
  });
  it('can discard only an unsubmitted review, including one expired before confirmation', async () => {
    const x = flowFixture(); expect(x.flow.canEdit()).toBe(true);
    x.clock.mockReturnValue(x.confirmation.expires_at*1000); await x.flow.confirm([]);
    expect(x.flow.snapshot().phase).toBe('expired'); expect(x.commands.confirm).not.toHaveBeenCalled();
    expect(x.flow.discardUnsubmitted()).toBe(true); expect(x.flow.snapshot().phase).toBe('closed');
    expect(x.flow.discardUnsubmitted()).toBe(false); await x.flow.confirm([]); expect(x.commands.confirm).not.toHaveBeenCalled();
  });
  it('cannot discard while confirmation is pending or after its receipt arrives', async () => {
    const x = flowFixture(), wait = deferred<ReturnType<typeof parseTransferConfirmationReceipt>>();
    x.commands.confirm.mockReturnValueOnce(wait.promise); const task = x.flow.confirm([]);
    expect(x.flow.canEdit()).toBe(false); expect(x.flow.discardUnsubmitted()).toBe(false);
    wait.resolve(parseTransferConfirmationReceipt(x.confirmation,x.preparation)); await task;
    expect(x.flow.discardUnsubmitted()).toBe(false); expect(x.flow.snapshot().confirmation?.id).toBe(x.confirmation.id);
  });
  it('never makes an uncertain confirmation editable after expiry or a failed retry', async () => {
    const x = flowFixture(); x.commands.confirm.mockRejectedValue(new Error('response lost'));
    await x.flow.confirm([]); expect(x.flow.snapshot().phase).toBe('confirmation-uncertain');
    expect(x.flow.discardUnsubmitted()).toBe(false);
    x.clock.mockReturnValue(x.confirmation.expires_at*1000); await x.flow.confirm([]);
    expect(x.flow.snapshot().phase).toBe('expired'); expect(x.flow.canEdit()).toBe(false);
    expect(x.flow.discardUnsubmitted()).toBe(false); expect(x.commands.confirm).toHaveBeenCalledTimes(1);
  });
  it('does nothing on construction and does not deliver after confirmation', async () => {
    const x = flowFixture(); expect(x.capture).not.toHaveBeenCalled(); expect(x.flow.snapshot().phase).toBe('ready');
    await x.flow.confirm([]); expect(x.flow.snapshot().phase).toBe('reserved'); expect(x.commands.deliver).not.toHaveBeenCalled();
    expect(isReloadBlocked()).toBe(false); x.flow.dispose();
  });
  it('blocks concurrent confirmation and reload, then releases the UI lock', async () => {
    const x = flowFixture(), wait = deferred<ReturnType<typeof parseTransferConfirmationReceipt>>();
    x.commands.confirm.mockReturnValueOnce(wait.promise);
    const task = x.flow.confirm([]); await x.flow.confirm([]);
    expect(x.commands.confirm).toHaveBeenCalledTimes(1); expect(isReloadBlocked()).toBe(true);
    wait.resolve(parseTransferConfirmationReceipt(x.confirmation,x.preparation)); await task;
    expect(isReloadBlocked()).toBe(false); expect(x.flow.snapshot().phase).toBe('reserved'); x.flow.dispose();
  });
  it('never retries ambiguous delivery, even if a subsequent status read still reports held', async () => {
    const x = flowFixture(); await x.flow.confirm([]); x.commands.deliver.mockRejectedValueOnce(new Error('lost response'));
    await x.flow.deliver(); expect(x.flow.snapshot().phase).toBe('delivery-uncertain');
    await x.flow.deliver(); expect(x.commands.deliver).toHaveBeenCalledTimes(1);
    await x.flow.readStatus(); expect(x.flow.snapshot().phase).toBe('observed');
    expect(x.flow.canDeliver()).toBe(false);
    await x.flow.deliver(); expect(x.commands.deliver).toHaveBeenCalledTimes(1); expect(isReloadBlocked()).toBe(false); x.flow.dispose();
  });
  it('allows only an explicit same-review retry of an uncertain confirmation', async () => {
    const x = flowFixture(); x.commands.confirm.mockRejectedValueOnce(new Error('lost response'));
    await x.flow.confirm([]); expect(x.flow.snapshot().phase).toBe('confirmation-uncertain'); expect(x.commands.confirm).toHaveBeenCalledTimes(1);
    await x.flow.confirm([]); expect(x.flow.snapshot().phase).toBe('reserved');
    expect(x.commands.confirm.mock.calls[0].slice(0,4)).toEqual(x.commands.confirm.mock.calls[1].slice(0,4)); x.flow.dispose();
  });
  it('resolves uncertain confirmation via status read using preserved preparation proofs', async () => {
    const x = flowFixture(); x.commands.confirm.mockRejectedValueOnce(new Error('lost network response'));
    await x.flow.confirm([]); expect(x.flow.snapshot().phase).toBe('confirmation-uncertain'); expect(x.flow.snapshot().confirmation).toBeNull();
    await x.flow.readStatus();
    expect(x.commands.confirm).toHaveBeenCalledTimes(2);
    expect(x.transfers.status).toHaveBeenCalledTimes(1);
    expect(x.flow.snapshot().phase).toBe('observed');
    expect(x.flow.snapshot().confirmation).not.toBeNull();
    expect(x.flow.snapshot().status).toEqual(x.status);
    expect(x.commands.confirm.mock.calls[0].slice(0,4)).toEqual(x.commands.confirm.mock.calls[1].slice(0,4));
    expect(x.commands.deliver).not.toHaveBeenCalled();
    expect(x.flow.canDeliver()).toBe(true);
    await x.flow.deliver();
    expect(x.commands.deliver).toHaveBeenCalledTimes(1);
    expect(x.flow.canDeliver()).toBe(false);
    x.flow.dispose();
  });
  it.each(['dispose','invalidate'] as const)('ignores late confirmation after %s', async action => {
    const x = flowFixture(), wait = deferred<ReturnType<typeof parseTransferConfirmationReceipt>>(); x.commands.confirm.mockReturnValueOnce(wait.promise);
    const task = x.flow.confirm([]); x.flow[action](); wait.resolve(parseTransferConfirmationReceipt(x.confirmation,x.preparation)); await task;
    expect(x.flow.snapshot()).toEqual({ phase:'closed',confirmation:null,delivery:null,status:null,error:false });
    expect(isReloadBlocked()).toBe(false); await x.flow.deliver(); expect(x.commands.deliver).not.toHaveBeenCalled();
  });
  it('does not dispatch an expired reservation', async () => {
    const x = flowFixture(); await x.flow.confirm([]); x.clock.mockReturnValue(x.confirmation.expires_at * 1000);
    await x.flow.deliver(); expect(x.flow.snapshot().phase).toBe('expired'); expect(x.commands.deliver).not.toHaveBeenCalled(); x.flow.dispose();
  });
  it('still permits status observation after the signing window expires', async () => {
    const x = flowFixture(); await x.flow.confirm([]); x.clock.mockReturnValue((x.confirmation.expires_at + 1) * 1000);
    await x.flow.readStatus(); expect(x.transfers.status).toHaveBeenCalledTimes(1); expect(x.flow.snapshot().status).toEqual(x.status);
    await x.flow.deliver(); expect(x.commands.deliver).not.toHaveBeenCalled(); x.flow.dispose();
  });
  it('never delivers after confirmation says the operation was already dispatched', async () => {
    const x = flowFixture(); x.commands.confirm.mockResolvedValueOnce(parseTransferConfirmationReceipt({ ...x.confirmation,state:'delivery_pending' },x.preparation));
    await x.flow.confirm([]); await x.flow.deliver(); expect(x.commands.deliver).not.toHaveBeenCalled(); x.flow.dispose();
  });
  it('drops operation details when the captured session changes mid-confirmation', async () => {
    const x = flowFixture(), wait = deferred<ReturnType<typeof parseTransferConfirmationReceipt>>(); x.commands.confirm.mockReturnValueOnce(wait.promise);
    const task = x.flow.confirm([]); x.commands.assertCurrent.mockImplementation(() => { throw new Error('session changed'); });
    wait.resolve(parseTransferConfirmationReceipt(x.confirmation,x.preparation)); await task;
    expect(x.flow.snapshot().phase).toBe('closed'); expect(x.flow.snapshot().confirmation).toBeNull(); expect(isReloadBlocked()).toBe(false);
  });
  it('keeps accepted as unconfirmed and prevents a second delivery', async () => {
    const x = flowFixture(); await x.flow.confirm([]); await x.flow.deliver(); await x.flow.deliver();
    expect(x.flow.snapshot().phase).toBe('accepted'); expect(x.flow.snapshot().delivery?.settlement).toBe('unconfirmed');
    expect(x.commands.deliver).toHaveBeenCalledTimes(1); x.flow.dispose();
  });
  it('rejects a status for a different user operation and preserves the no-resend state', async () => {
    const x = flowFixture(); await x.flow.confirm([]); await x.flow.deliver();
    x.transfers.status.mockResolvedValueOnce({ ...x.status,userop_hash:`0x${'22'.repeat(32)}` });
    await x.flow.readStatus(); expect(x.flow.snapshot()).toMatchObject({ phase:'accepted',status:null,error:true });
    await x.flow.deliver(); expect(x.commands.deliver).toHaveBeenCalledTimes(1); x.flow.dispose();
  });
});

function signingFixture() {
  const x = fixture(), signerIndex = x.preparation.review.policy.signers.findIndex(s => s.kind === 1);
  const credential = parseCredentialDetail({ scope:x.preparation.review.scope,credential_ref:'op_00000000-0000-4000-8000-000000000001',
    credential_id:'c3ludGhldGlj',public_key:x.preparation.review.policy.signers[signerIndex].key,
    device_availability:'unknown',onchain_authority:'not_assessed' },x.preparation.review.scope,
    // Set a stable owned reference for the synthetic fixture.
    'op_00000000-0000-4000-8000-000000000001');
  const proof = x.f.f.assertion(x.candidate.digest), encode = (bytes:Uint8Array) => Buffer.from(bytes).toString('base64url');
  const wire = { authenticator_data:encode(proof.authenticatorData),client_data:encode(proof.clientDataJSON),signature:encode(proof.signatureDER) };
  const prove = vi.fn(async () => wire), assertCurrent = vi.fn();
  const signing = new TransferSigning(x.preparation,[credential],assertCurrent,prove);
  return { ...x,signerIndex,credential,wire,prove,assertCurrent,signing };
}

describe('Transfer explicit proof collection', () => {
  it('does not prompt on construction; invokes a ceremony synchronously from its explicit action', async () => {
    const x = signingFixture(); expect(x.prove).not.toHaveBeenCalled();
    const task = x.signing.passkey(x.signerIndex,x.credential.credential_ref);
    expect(x.prove).toHaveBeenCalledTimes(1); await task;
    expect(x.signing.signedIndices()).toEqual([x.signerIndex]);
    await expect(x.signing.confirmationProofs()).rejects.toThrow(); // One factor is not a two-factor quorum.
    x.signing.dispose();
  });
  it('verifies a complete mixed quorum without changing the reviewed policy', async () => {
    const x = signingFixture(); await x.signing.passkey(x.signerIndex,x.credential.credential_ref);
    const ecdsa = (await x.f.proofs(x.candidate.digest)).find(p => p.kind === 'ecdsa')!;
    await x.signing.external(ecdsa.signerIndex,ecdsa.signature);
    expect(await x.signing.confirmationProofs()).toHaveLength(2); expect(x.preparation.review.policy.spendThreshold).toBe(2);
    x.signing.dispose();
  });
  it('rejects an unrelated external digest without counting a factor', async () => {
    const x = signingFixture(), ecdsa = (await x.f.proofs(`0x${'22'.repeat(32)}`)).find(p => p.kind === 'ecdsa')!;
    await expect(x.signing.external(ecdsa.signerIndex,ecdsa.signature)).rejects.toThrow(); expect(x.signing.signedIndices()).toEqual([]); x.signing.dispose();
  });
  it('rejects an unlisted credential before prompting', async () => {
    const x = signingFixture(); await expect(x.signing.passkey(x.signerIndex,createResourceId('operation'))).rejects.toThrow();
    expect(x.prove).not.toHaveBeenCalled(); x.signing.dispose();
  });
  it('rejects expiry before prompting', async () => {
    const x = signingFixture(); x.clock.mockReturnValue(x.preparation.expires_at*1000);
    await expect(x.signing.passkey(x.signerIndex,x.credential.credential_ref)).rejects.toThrow(); expect(x.prove).not.toHaveBeenCalled(); x.signing.dispose();
  });
  it('rejects a proof whose ceremony finishes after expiry', async () => {
    const x = signingFixture(); x.prove.mockImplementation(async () => { x.clock.mockReturnValue(x.preparation.expires_at*1000); return x.wire; });
    await expect(x.signing.passkey(x.signerIndex,x.credential.credential_ref)).rejects.toThrow(); expect(x.signing.signedIndices()).toEqual([]); x.signing.dispose();
  });
  it('ignores a late ceremony after disposal and does not collect it twice', async () => {
    const x = signingFixture(), wait = deferred<typeof x.wire>(); x.prove.mockReturnValueOnce(wait.promise);
    const task = x.signing.passkey(x.signerIndex,x.credential.credential_ref);
    await x.signing.passkey(x.signerIndex,x.credential.credential_ref); expect(x.prove).toHaveBeenCalledTimes(1);
    x.signing.dispose(); wait.resolve(x.wire); await expect(task).rejects.toThrow(); expect(x.signing.signedIndices()).toEqual([]);
  });
  it('does not reuse proofs after a session replacement', async () => {
    const x = signingFixture(); await x.signing.passkey(x.signerIndex,x.credential.credential_ref);
    x.assertCurrent.mockImplementation(() => { throw new Error('Session changed'); });
    await expect(x.signing.confirmationProofs()).rejects.toThrow(); x.signing.dispose(); expect(x.signing.signedIndices()).toEqual([]);
  });
  it('binds the displayed username to the exact reviewed destination without resolving or signing on render', () => {
    const x = signingFixture(), commands = { assertCurrent:vi.fn(),confirm:vi.fn(),deliver:vi.fn() };
    const runtime = { transferCommands:vi.fn(() => commands),transfers:vi.fn(() => ({ assertCurrent:vi.fn(),status:vi.fn() })),subscribe:vi.fn() };
    const recipient = { username:'daniel',display_name:'Daniel',network_id:x.request.network_id,address:x.request.destination.address,
      verified_at:x.f.now,expires_at:x.f.now+30 };
    const props = { runtime,uid:'synthetic',selected:x.selected,request:x.request,review:x.review,environment:parseEnvironment(environments.production),
      credentials:[x.credential],metadata:[{ asset_id:x.request.asset_id,decimals:18,symbol:'ETH' }],english:false,recipient };
    const html = renderToStaticMarkup(createElement(TransferReview,props));
    expect(html).toContain('@daniel'); expect(html).toContain(x.request.destination.address);
    expect(() => renderToStaticMarkup(createElement(TransferReview,{ ...props,recipient:{ ...recipient,address:`0x${'ab'.repeat(20)}` } }))).toThrow('Recipient');
    expect(commands.confirm).not.toHaveBeenCalled(); expect(commands.deliver).not.toHaveBeenCalled(); expect(x.prove).not.toHaveBeenCalled(); x.signing.dispose();
  });
  it.each([false,true])('renders the review and explicit controls without signing (English=%s)', english => {
    const x = signingFixture(), commands = { assertCurrent:vi.fn(),confirm:vi.fn(),deliver:vi.fn() };
    const runtime = { transferCommands:vi.fn(() => commands),transfers:vi.fn(() => ({ assertCurrent:vi.fn(),status:vi.fn() })),subscribe:vi.fn() };
    const markup = renderToStaticMarkup(createElement(TransferReview,{ runtime,uid:'synthetic',selected:x.selected,request:x.request,
      review:x.review,environment:parseEnvironment(environments.production),credentials:[x.credential],metadata:[{ asset_id:x.request.asset_id,decimals:18,symbol:'ETH' }],english }));
    expect(markup).toContain(english ? 'Review transfer' : 'Revisar envío');
    expect(markup).toContain(x.request.destination.address); expect(markup).toContain(x.candidate.digest);
    expect(markup).toContain(english ? 'Use my key' : 'Usar mi llave');
    expect(markup).toContain(english ? 'Send' : 'Enviar');
    expect(commands.confirm).not.toHaveBeenCalled(); expect(commands.deliver).not.toHaveBeenCalled(); expect(x.prove).not.toHaveBeenCalled();
    x.signing.dispose();
  });
});
