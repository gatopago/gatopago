import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createResourceId } from '@gatopago/shared/v3/primitives';
import { prepareInitialization } from '@gatopago/shared/v3/initialization';
import { parseInitializationPreparation } from '@gatopago/shared/v3/initialization-wire';
import { prepareCreationOperation } from '@gatopago/shared/v3/creation-operation';
import { creationGasWire, parseCreationPreview } from '@gatopago/shared/v3/creation-operation-wire';
import type { BrowserAuth } from '../src/auth/browser';
import { CreationFlow } from '../src/wallet/creation-flow';
import { creationFeeUnit, formatCreationFee, parseCreationFee } from '../src/wallet/creation-fee';
import { isReloadBlocked } from '../src/pwa/reload-guard';
import { initializationFixture } from '@gatopago/test-fixtures/v3-initialization';

type Session = Awaited<ReturnType<BrowserAuth['creationOperation']>>;
const error = (code: string) => Object.assign(new Error(code), { code });
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };
const encode = (p: ReturnType<ReturnType<typeof initializationFixture>['assertion']>) => ({ authenticator_data: Buffer.from(p.authenticatorData).toString('base64url'),
  client_data: Buffer.from(p.clientDataJSON).toString('base64url'), signature: Buffer.from(p.signatureDER).toString('base64url') });
function fixture(recorded = false) {
  const f = initializationFixture(), initial = prepareInitialization(f.input), initialProof = f.assertion(initial.digest);
  const expected = { id: createResourceId('operation'), credentialRef: createResourceId('operation'), document: f.pin.document,
    profileDigest: f.pin.digest, userSaltCommitment: f.input.userSaltCommitment, scope: f.input.scope };
  const preparation = parseInitializationPreparation({ initialization_id: expected.id, state: 'authorized', approval_digest: initial.digest,
    profile_sha256: f.pin.digest, account_deployed: false, receive_enabled: false, spend_enabled: false,
    credential_ref: expected.credentialRef, credential_id: 'c3ludGhldGlj', public_key: f.input.publicKey,
    valid_after: f.input.validAfter, valid_until: f.input.validUntil }, expected);
  const consent = { preparation, expected };
  const terms = { verificationGasLimit: 2_000_000n, callGasLimit: 100_000n, preVerificationGas: 150_000n,
    maxFeePerGas: 1_000_000_000n, maxPriorityFeePerGas: 0n, maximumGasCharge: 3_000_000_000_000_000n };
  const candidate = prepareCreationOperation(f.input, initialProof, terms, f.input.validAfter);
  const receipt = { initialization_id: expected.id, state: 'prepared', user_op_hash: candidate.userOpHash, operation_digest: candidate.digest,
    expires_at: f.input.validUntil, authorization_expired: false, delivery_state: 'not_requested', deployment_assessment: 'not_assessed', receive_enabled: false, spend_enabled: false };
  const wire = { observed_at: f.input.validAfter, receipt, gas_terms: creationGasWire(terms), initial_assertion: encode(initialProof),
    get lifecycle() { return { job_state: receipt.state === 'prepared' ? 'not_requested' : receipt.delivery_state === 'expired' ? 'complete' : 'ready',
      reason: receipt.delivery_state === 'expired' ? 'expired' : null, observation: null, bootstrap: null, account_readiness: 'not_assessed' }; } };
  const review = () => ({ wire: structuredClone(wire), preview: parseCreationPreview(wire, consent) });
  const authorized = { ...receipt, state: 'authorized' as const, delivery_state: 'pending' as const };
  const session = { assertCurrent: vi.fn(), prepare: vi.fn<Session['prepare']>().mockImplementation(async () => review()),
    restore: vi.fn<Session['restore']>().mockImplementation(async () => review()), authorize: vi.fn<Session['authorize']>().mockResolvedValue(authorized as Awaited<ReturnType<Session['authorize']>>) };
  const capture = vi.fn<() => Promise<Session>>(async () => session);
  const prove = vi.fn(async ({ challenge }: { challenge: `0x${string}` }) => encode(f.assertion(challenge)));
  const flow = new CreationFlow(capture, prove, f.pin, consent, recorded);
  const absent = async () => { session.restore.mockRejectedValueOnce(error('creation/not-found')); await flow.restore(); };
  return { f, consent, candidate, terms, wire, review, authorized, session, capture, prove, flow, absent };
}
beforeEach(() => { vi.stubGlobal('window', {}); vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('creation confirmation controller; synthetic session, real P256 and execution digest', () => {
  it('consults server terms without asking for a decimal cap or signing automatically', async () => {
    const t = fixture(); await t.absent(); await t.flow.prepare();
    expect(t.session.prepare.mock.calls[0][1]).toBeNull();
    expect(t.flow.snapshot()).toMatchObject({ phase: 'ready', cap: t.terms.maximumGasCharge.toString(),
      review: { maximumCharge: t.candidate.maximumEntryPointCharge } });
    expect(t.prove).not.toHaveBeenCalled(); expect(t.session.authorize).not.toHaveBeenCalled();
    await t.flow.confirm(); expect(t.prove.mock.calls[0][0].challenge).toBe(t.candidate.digest);
    expect(t.session.authorize).toHaveBeenCalledOnce();
  });
  it('restores the same automatic preparation after losing its response, without repricing or signing', async () => {
    const t = fixture(); await t.absent(); t.session.prepare.mockRejectedValueOnce(error('creation/unavailable'));
    await t.flow.prepare(); expect(t.flow.snapshot()).toMatchObject({ phase: 'uncertain', cap: null });
    await t.flow.prepare(); expect(t.session.prepare).toHaveBeenCalledOnce();
    await t.flow.restore(); expect(t.flow.snapshot()).toMatchObject({ phase: 'ready', cap: t.terms.maximumGasCharge.toString() });
    expect(t.session.prepare).toHaveBeenCalledOnce(); expect(t.prove).not.toHaveBeenCalled();
  });
  it('retries only an explicitly read-absent automatic request and locks the returned ceiling', async () => {
    const t = fixture(); await t.absent(); t.session.prepare.mockRejectedValueOnce(error('creation/unavailable'));
    await t.flow.prepare(); await t.absent(); expect(t.flow.snapshot().phase).toBe('prepare-retry');
    await t.flow.prepare(); expect(t.session.prepare.mock.calls.map(call => call[1])).toEqual([null, null]);
    const changed = { ...t.terms, maximumGasCharge: t.terms.maximumGasCharge + 1n };
    const initialProof = t.f.assertion(prepareInitialization(t.f.input).digest);
    const repriced = prepareCreationOperation(t.f.input, initialProof, changed, t.f.input.validAfter);
    t.wire.gas_terms = creationGasWire(changed); t.wire.initial_assertion = encode(initialProof);
    t.wire.receipt.operation_digest = repriced.digest; t.wire.receipt.user_op_hash = repriced.userOpHash;
    expect(() => parseCreationPreview(t.wire, t.consent)).not.toThrow();
    await t.flow.restore(); expect(t.flow.snapshot()).toMatchObject({ phase: 'uncertain', error: 'creation/conflict' });
    expect(t.prove).not.toHaveBeenCalled();
  });
  it('restores historical bootstrap without polling, signing or repeating an authorization', async () => {
    const t = fixture(); Object.assign(t.wire.receipt, t.authorized, { delivery_state: 'accepted' });
    const lifecycle = { ...t.wire.lifecycle, job_state: 'complete', reason: 'projected',
      observation: { epoch: 1, observed_at: t.wire.observed_at, status: 'observed', finality: 'finalized', valid_until: t.wire.observed_at + 60,
        transaction_hash: `0x${'a'.repeat(64)}`, outcome: 'creation_succeeded' },
      bootstrap: { recorded_at: t.wire.observed_at, evidence_expires_at: t.wire.observed_at + 60,
        wallet_id: createResourceId('wallet'), wallet_account_id: createResourceId('walletAccount') } };
    const wire = { ...t.wire, lifecycle };
    t.session.restore.mockResolvedValue({ wire, preview: parseCreationPreview(wire, t.consent) });
    await t.flow.restore(); expect(t.flow.snapshot().lifecycle).toEqual(lifecycle);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(t.session.restore).toHaveBeenCalledOnce(); expect(t.prove).not.toHaveBeenCalled(); expect(t.session.authorize).not.toHaveBeenCalled();
    t.flow.invalidate(); expect(t.flow.snapshot()).toMatchObject({ lifecycle: null, checkedAt: null, receipt: null });
  });
  it('replaces a prior confirmation with newer uncertain evidence, but refuses an older observation', async () => {
    const t = fixture(); Object.assign(t.wire.receipt, t.authorized, { delivery_state: 'accepted' });
    const o = { epoch: 1, observed_at: t.wire.observed_at, status: 'observed', finality: 'finalized', valid_until: t.wire.observed_at + 60,
      transaction_hash: `0x${'a'.repeat(64)}`, outcome: 'creation_succeeded' };
    const wire = { ...t.wire, lifecycle: { ...t.wire.lifecycle, observation: o } };
    const response = () => ({ wire: structuredClone(wire), preview: parseCreationPreview(wire, t.consent) });
    t.session.restore.mockImplementation(async () => response()); await t.flow.restore();
    Object.assign(o, { epoch: 2, status: 'unavailable', finality: 'not_assessed', valid_until: null, transaction_hash: null, outcome: null });
    await t.flow.restore(); expect(t.flow.snapshot().lifecycle?.observation).toMatchObject({ epoch: 2, status: 'unavailable' });
    o.epoch = 1; await t.flow.restore(); expect(t.flow.snapshot()).toMatchObject({ phase: 'uncertain', error: 'creation/conflict' });
    expect(t.prove).not.toHaveBeenCalled(); expect(t.session.authorize).not.toHaveBeenCalled();
  });
  it('a failed or stopped refresh never replaces the last checked date with the current time', async () => {
    const t = fixture(); Object.assign(t.wire.receipt, t.authorized); await t.flow.restore();
    const checked = t.flow.snapshot().checkedAt;
    t.session.restore.mockRejectedValueOnce(error('creation/unavailable')); await t.flow.restore();
    expect(t.flow.snapshot()).toMatchObject({ phase: 'uncertain', checkedAt: checked });
    expect(t.prove).not.toHaveBeenCalled();
  });
  it('constructs and subscribes without I/O; mount reading never signs or prepares', async () => {
    const t = fixture(), unsubscribe = t.flow.subscribe(vi.fn()); t.flow.checkSession();
    expect(t.capture).not.toHaveBeenCalled(); expect(t.prove).not.toHaveBeenCalled(); await t.absent();
    expect(t.flow.snapshot().phase).toBe('absent'); expect(t.session.prepare).not.toHaveBeenCalled(); expect(t.prove).not.toHaveBeenCalled(); unsubscribe();
  });
  it('reviews an exact decimal cap then invokes WebAuthn synchronously only on confirmation', async () => {
    const t = fixture(); await t.absent(); await t.flow.prepare('0,003');
    expect(t.session.prepare.mock.calls[0][1]).toBe('3000000000000000'); expect(t.prove).not.toHaveBeenCalled();
    expect(t.flow.snapshot()).toMatchObject({ phase: 'ready', review: { maximumCharge: 2_250_000_000_000_000n, userOpHash: t.candidate.userOpHash } });
    const pending = t.flow.confirm(); expect(t.prove).toHaveBeenCalledOnce(); expect(isReloadBlocked()).toBe(true); await pending;
    expect(t.prove.mock.calls[0][0].challenge).toBe(t.candidate.digest);
    expect(t.candidate.digest).not.toBe(t.consent.preparation.approval_digest);
    expect(t.flow.snapshot()).toMatchObject({ phase: 'authorized', receipt: { deployment_assessment: 'not_assessed', receive_enabled: false, spend_enabled: false } });
    expect(isReloadBlocked()).toBe(false);
  });
  it('restores an existing operation without repricing it or signing on reload', async () => {
    const t = fixture(true); await t.flow.restore();
    expect(t.flow.snapshot().phase).toBe('ready'); expect(t.session.prepare).not.toHaveBeenCalled(); expect(t.prove).not.toHaveBeenCalled();
    t.flow.dispose(); await t.flow.restore(); expect(t.session.restore).toHaveBeenCalledTimes(2); expect(t.prove).not.toHaveBeenCalled();
  });
  it('does not replace a known recorded operation when a read returns 404', async () => {
    const t = fixture(true); await t.absent(); await t.flow.prepare('0.003');
    expect(t.flow.snapshot().phase).toBe('uncertain'); expect(t.session.prepare).not.toHaveBeenCalled();
  });
  it('does not treat an unavailable history as absence', async () => {
    const t = fixture(); t.session.restore.mockRejectedValueOnce(error('creation/unavailable'));
    await t.flow.restore(); await t.flow.prepare('0.003'); expect(t.flow.snapshot().phase).toBe('uncertain'); expect(t.session.prepare).not.toHaveBeenCalled();
  });
  it('ignores duplicate and out-of-order actions', async () => {
    const t = fixture(); await t.flow.confirm(); await t.flow.prepare('0.003'); await t.flow.retryAuthorization();
    expect(t.session.prepare).not.toHaveBeenCalled(); await t.absent();
    const preparing = t.flow.prepare('0.003'); await t.flow.prepare('1'); await preparing;
    const confirming = t.flow.confirm(); await t.flow.confirm(); await t.flow.restore(); await confirming;
    expect(t.session.prepare).toHaveBeenCalledOnce(); expect(t.prove).toHaveBeenCalledOnce(); expect(t.session.authorize).toHaveBeenCalledOnce();
  });
  it('preserves uncertain preparation and reads the same operation before continuing', async () => {
    const t = fixture(); await t.absent(); t.session.prepare.mockRejectedValueOnce(error('creation/unavailable'));
    await t.flow.prepare('0.003'); await t.flow.prepare('9'); expect(t.flow.snapshot().phase).toBe('uncertain');
    await t.flow.restore(); expect(t.flow.snapshot().phase).toBe('ready'); expect(t.session.prepare).toHaveBeenCalledOnce(); expect(t.prove).not.toHaveBeenCalled();
  });
  it('retries only the same cap if uncertain preparation is still absent', async () => {
    const t = fixture(); await t.absent(); t.session.prepare.mockRejectedValueOnce(error('creation/unavailable'));
    await t.flow.prepare('0.003'); await t.absent(); expect(t.flow.snapshot().phase).toBe('prepare-retry');
    await t.flow.prepare('99'); expect(t.session.prepare.mock.calls.map((call) => call[1])).toEqual(['3000000000000000', '3000000000000000']);
  });
  it('does not silently raise a rejected cap, but permits another explicit review', async () => {
    const t = fixture(); await t.absent(); t.session.prepare.mockRejectedValueOnce(error('creation/cap-too-low'));
    await t.flow.prepare('0.001'); expect(t.flow.snapshot()).toMatchObject({ phase: 'absent', cap: null, error: 'creation/cap-too-low' });
    await t.flow.prepare('0.003'); expect(t.session.prepare.mock.calls.map((call) => call[1])).toEqual(['1000000000000000', '3000000000000000']);
  });
  it('resolves a recorded authorization by GET without another signature or POST', async () => {
    const t = fixture(); await t.flow.restore();
    t.session.authorize.mockRejectedValueOnce(error('creation/unavailable')); await t.flow.confirm();
    expect(t.flow.snapshot()).toMatchObject({ phase: 'uncertain', signed: true });
    Object.assign(t.wire.receipt, t.authorized); await t.flow.restore(); await t.flow.confirm(); await t.flow.retryAuthorization();
    expect(t.flow.snapshot().phase).toBe('authorized'); expect(t.prove).toHaveBeenCalledOnce(); expect(t.session.authorize).toHaveBeenCalledOnce();
  });
  it('replays the same proof only after an explicit read confirms it is not authorized', async () => {
    const t = fixture(); await t.flow.restore(); t.session.authorize.mockRejectedValueOnce(error('creation/unavailable'));
    await t.flow.confirm(); await t.flow.retryAuthorization(); expect(t.session.authorize).toHaveBeenCalledOnce();
    await t.flow.restore(); expect(t.flow.snapshot()).toMatchObject({ phase: 'ready', signed: true });
    await t.flow.confirm(); expect(t.prove).toHaveBeenCalledOnce(); await t.flow.retryAuthorization();
    expect(t.session.authorize.mock.calls[0].slice(0, 3)).toEqual(t.session.authorize.mock.calls[1].slice(0, 3));
    expect(t.flow.snapshot().phase).toBe('authorized');
  });
  it.each(['pending', 'sending', 'uncertain', 'accepted', 'expired'])('does not equate delivery %s with active or funded account', async (delivery) => {
    const t = fixture(); Object.assign(t.wire.receipt, t.authorized, { delivery_state: delivery }); await t.flow.restore();
    expect(t.flow.snapshot()).toMatchObject({ phase: 'authorized', receipt: { delivery_state: delivery, deployment_assessment: 'not_assessed', receive_enabled: false, spend_enabled: false } });
    expect(t.prove).not.toHaveBeenCalled();
  });
  it('never signs expired prepared data, but can still read a recorded authorization', async () => {
    const t = fixture(); await t.flow.restore(); vi.setSystemTime(t.f.input.validUntil * 1000);
    await t.flow.confirm(); expect(t.flow.snapshot().phase).toBe('expired'); expect(t.prove).not.toHaveBeenCalled();
    Object.assign(t.wire.receipt, t.authorized, { authorization_expired: true }); t.wire.observed_at = t.f.input.validUntil;
    await t.flow.restore(); expect(t.flow.snapshot().phase).toBe('authorized');
  });
  it('expires the visible confirmation button without network polling', async () => {
    const t = fixture(); await t.flow.restore(); await vi.advanceTimersByTimeAsync(t.f.input.validUntil * 1000 - Date.now());
    expect(t.flow.snapshot().phase).toBe('expired'); expect(t.session.restore).toHaveBeenCalledOnce(); expect(t.prove).not.toHaveBeenCalled();
  });
  it('does not infer key loss or recovery from a cancelled ceremony', async () => {
    const t = fixture(); await t.flow.restore(); t.prove.mockRejectedValueOnce(error('cancelled')); await t.flow.confirm();
    expect(t.flow.snapshot()).toMatchObject({ phase: 'ready', error: 'cancelled', signed: false }); expect(t.session.authorize).not.toHaveBeenCalled();
  });
  it('stops a noncooperative ceremony and ignores its late proof', async () => {
    const t = fixture(), late = deferred<Awaited<ReturnType<typeof t.prove>>>(); await t.flow.restore(); t.prove.mockReturnValueOnce(late.promise);
    const pending = t.flow.confirm(); t.flow.stop(); await pending;
    late.resolve(encode(t.f.assertion(t.candidate.digest))); await Promise.resolve();
    expect(t.flow.snapshot().phase).toBe('uncertain'); expect(t.session.authorize).not.toHaveBeenCalled(); expect(isReloadBlocked()).toBe(false);
  });
  it('stopping a submitted authorization preserves uncertainty; a late response cannot change the view', async () => {
    const t = fixture(), late = deferred<Awaited<ReturnType<Session['authorize']>>>(); await t.flow.restore(); t.session.authorize.mockReturnValueOnce(late.promise);
    const pending = t.flow.confirm(); await Promise.resolve(); t.flow.stop(); await pending;
    late.resolve(t.authorized as Awaited<ReturnType<Session['authorize']>>); await Promise.resolve();
    expect(t.flow.snapshot()).toMatchObject({ phase: 'uncertain', signed: true }); expect(isReloadBlocked()).toBe(false);
    await t.flow.restore(); await t.flow.retryAuthorization(); expect(t.prove).toHaveBeenCalledOnce();
  });
  it('session invalidation clears the operation and blocks a late session load', async () => {
    const t = fixture(), late = deferred<Session>(); t.capture.mockReturnValueOnce(late.promise);
    const pending = t.flow.restore(); t.flow.invalidate(); await pending; late.resolve(t.session); await Promise.resolve();
    expect(t.flow.snapshot()).toMatchObject({ phase: 'closed', review: null, receipt: null, signed: false });
    expect(t.session.restore).not.toHaveBeenCalled(); expect(isReloadBlocked()).toBe(false);
  });
  it('checks the captured Firebase User object before requesting a signature, including same UID replacement', async () => {
    const t = fixture(); await t.flow.restore(); t.session.assertCurrent.mockImplementation(() => { throw error('auth/session-changed'); });
    await t.flow.confirm(); expect(t.flow.snapshot().phase).toBe('closed'); expect(t.prove).not.toHaveBeenCalled();
  });
  it('bounds a noncooperative session load and releases the update guard', async () => {
    const t = fixture(); t.capture.mockReturnValueOnce(new Promise(() => undefined)); const pending = t.flow.restore();
    await vi.advanceTimersByTimeAsync(30_000); await pending;
    expect(t.flow.snapshot()).toMatchObject({ phase: 'uncertain', error: 'creation/timeout' }); expect(isReloadBlocked()).toBe(false);
  });
  it('disposes a read before StrictMode reconnect without allowing old work to publish', async () => {
    const t = fixture(), late = deferred<Session>(); t.capture.mockReturnValueOnce(late.promise);
    const pending = t.flow.restore(); t.flow.dispose(); await pending; await t.flow.restore(); late.resolve(t.session); await Promise.resolve();
    expect(t.flow.snapshot().phase).toBe('ready'); expect(t.session.restore).toHaveBeenCalledOnce(); expect(t.prove).not.toHaveBeenCalled();
  });
  it('reconstructs the preview rather than trusting the resource client metadata', async () => {
    const t = fixture(), response = t.review(); response.preview = { ...response.preview, candidate: { ...response.preview.candidate, digest: `0x${'a'.repeat(64)}` } };
    t.session.restore.mockResolvedValueOnce(response); await t.flow.restore(); expect(t.flow.snapshot().review!.digest).toBe(t.candidate.digest);
  });
  it('rejects inconsistent prepared responses and forbids changing the reviewed operation on refresh', async () => {
    const t = fixture(); await t.absent(); await t.flow.prepare('0.004'); expect(t.flow.snapshot().phase).toBe('uncertain');
    await t.flow.restore(); expect(t.flow.snapshot()).toMatchObject({ phase: 'uncertain', cap: '4000000000000000', error: 'creation/conflict' });
    // A fresh mount can inspect the persisted operation's own terms, but an
    // in-flight approved cap must not be silently replaced by a GET response.
    t.flow.dispose(); await t.flow.restore(); expect(t.flow.snapshot().phase).toBe('ready');
    t.wire.receipt.operation_digest = `0x${'f'.repeat(64)}`; await t.flow.restore(); expect(t.flow.snapshot().phase).toBe('uncertain');
    await t.flow.confirm(); expect(t.prove).not.toHaveBeenCalled();
  });
  it('does not accept an initial-consent proof as the creation-operation proof', async () => {
    const t = fixture(); await t.flow.restore(); t.prove.mockResolvedValueOnce(t.wire.initial_assertion); await t.flow.confirm();
    expect(t.session.authorize).not.toHaveBeenCalled(); expect(t.flow.snapshot().signed).toBe(false);
  });
  it('rejects forged authorization replies and an authorized-to-prepared regression', async () => {
    const t = fixture(); await t.flow.restore(); t.session.authorize.mockResolvedValueOnce({ ...t.authorized, receive_enabled: true } as never);
    await t.flow.confirm(); expect(t.flow.snapshot().phase).toBe('uncertain'); await t.flow.restore(); await t.flow.retryAuthorization();
    expect(t.flow.snapshot().phase).toBe('authorized'); await t.flow.restore(); expect(t.flow.snapshot()).toMatchObject({ phase: 'uncertain', error: 'creation/conflict' });
  });
});

describe('human gas units; explicit supported presentation, never network admission', () => {
  it('uses exact integer arithmetic for ETH and AVAX, including one atomic unit', () => {
    expect(parseCreationFee('0.000000000000000001', 'eip155:84532')).toBe('1');
    expect(parseCreationFee('12,345678', 'eip155:43113')).toBe('12345678000000000000');
    expect(formatCreationFee(1n, 'eip155:421614')).toBe('0.000000000000000001 ETH');
    expect(formatCreationFee(3_000_000_000_000_000n, 'eip155:43113')).toBe('0.003 AVAX');
  });
  it.each(['', '0', '00.1', '-1', '+1', '1e-3', '.5', '1.', ' 1', '1\n', '1,000.00', '1.000,00', 'NaN', 'Infinity', '0.0000000000000000001', '9'.repeat(101)])('refuses ambiguous or unrepresentable cap %j', (value) => {
    expect(() => parseCreationFee(value, 'eip155:84532')).toThrow();
  });
  it('has no mainnet, unknown-chain or object-prototype fallback', () => {
    for (const network of ['eip155:1', 'eip155:8453', 'eip155:9999', 'toString', '__proto__']) {
      expect(creationFeeUnit(network)).toBeNull(); expect(() => parseCreationFee('1', network)).toThrow(); expect(() => formatCreationFee(1n, network)).toThrow();
    }
    expect(() => formatCreationFee(1n << 256n, 'eip155:84532')).toThrow();
  });
});
