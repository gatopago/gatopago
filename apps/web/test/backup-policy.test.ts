import { afterEach, describe, expect, it, vi } from 'vitest';
import { createResourceId } from '@gatopago/shared/v3/primitives';
import { hashSecurityPolicy, Role, signerId } from '@gatopago/shared/v3/security-policy';
import { prepareBackupEnrollment } from '@gatopago/shared/v3/backup-enrollment';
import { policySelection, passkeyPolicyDraft } from '../src/wallet/backup-policy';
import { BackupPolicyStore } from '../src/wallet/backup-policy-store';
import { policyReviewFixture } from './backup-policy.fixture';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe('Passkey policy review, not backup or independent exit', () => {
  it.each([2, 3, 16])('constructs a sorted %s-key draft with explicit spend/admin thresholds and no readiness claim', (count) => {
    const f = policyReviewFixture(count), selected = policySelection(f.consent, f.inventory, f.references, f.pin);
    const draft = passkeyPolicyDraft(selected, f.material);
    expect(draft.policy).toMatchObject({ mode: 'active', spendThreshold: 1, adminThreshold: 1, upgradeDelaySeconds: 259200 });
    expect(draft.hash).toBe(hashSecurityPolicy(draft.policy));
    const ids = draft.factors.map((factor) => signerId(factor.descriptor)); expect(ids).toEqual([...ids].sort());
    expect(draft.policy.signers.every((row) => row.roles === (Role.SPEND | Role.ADMIN))).toBe(true);
    expect(draft).toMatchObject({ backupReady: false, independentExit: 'not_configured', possession: 'not_assessed',
      onchainAuthority: 'not_assessed', recoverableLostKeys: count - 1 });
    expect(Object.isFrozen(draft.policy.signers)).toBe(true); expect(Object.isFrozen(draft.factors[0].descriptor)).toBe(true);
    const compiled = prepareBackupEnrollment({ ...f.t.f.input, nextPolicy: draft.policy }, f.t.f.input.validAfter);
    // Initial authority is unchanged; only additional keys prove new possession.
    expect(compiled.enrollments).toHaveLength(count - 1);
  });
  it.each(['unknown', 'initial-duplicate', 'repeated', 'empty', 'limit', 'pin', 'unauthorized'])('rejects %s selection before fetching material', (change) => {
    const f = policyReviewFixture(), consent = structuredClone(f.consent); let refs = [...f.references]; const pin = { ...f.pin };
    if (change === 'unknown') refs[0] = createResourceId('operation');
    if (change === 'initial-duplicate') refs[0] = consent.preparation.credential_ref;
    if (change === 'repeated') refs.push(refs[0]);
    if (change === 'empty') refs = [];
    if (change === 'limit') refs = Array.from({ length: 16 }, () => createResourceId('operation'));
    if (change === 'pin') pin.document += ' ';
    if (change === 'unauthorized') Object.assign(consent.preparation, { state: 'prepared' });
    expect(() => policySelection(consent, f.inventory, refs, pin)).toThrow();
  });
  it.each(['missing', 'response-order', 'initial-key', 'initial-id', 'same-public-key', 'same-id', 'scope'])('rejects %s detail instead of counting it as another factor', (change) => {
    const f = policyReviewFixture(), selected = policySelection(f.consent, f.inventory, f.references, f.pin), material = structuredClone(f.material);
    if (change === 'missing') material.pop();
    if (change === 'response-order') material.reverse();
    if (change === 'initial-key') Object.assign(material[0], { public_key: material[1].public_key });
    if (change === 'initial-id') Object.assign(material[0], { credential_id: 'Zg' });
    if (change === 'same-public-key') Object.assign(material[1], { public_key: material[0].public_key });
    if (change === 'same-id') Object.assign(material[1], { credential_id: material[0].credential_id });
    if (change === 'scope') Object.assign(material[1].scope, { origin: 'https://other.test' });
    expect(() => passkeyPolicyDraft(selected, material)).toThrow();
  });
});

function setup() {
  const f = policyReviewFixture(), assertCurrent = vi.fn();
  const detail = vi.fn(async (id: string, signal: AbortSignal) => {
    signal.throwIfAborted(); const result = f.material.find((row) => row.credential_ref === id);
    if (!result) throw new Error('Missing synthetic credential'); return result;
  });
  const capture = vi.fn(() => ({ assertCurrent, detail })), store = new BackupPolicyStore(capture);
  const review = () => store.review(f.consent, f.inventory, f.references, f.pin);
  return { ...f, store, review, capture, detail, assertCurrent };
}
describe('Component-owned credential policy review', () => {
  it('is inert until requested, reads each selected factor once in parallel and keeps no timer afterward', async () => {
    vi.useFakeTimers(); const f = setup();
    expect(f.store.snapshot()).toEqual({ phase: 'idle', draft: null, code: null }); expect(f.capture).not.toHaveBeenCalled();
    await f.review(); expect(f.detail).toHaveBeenCalledTimes(3); expect(f.store.snapshot().phase).toBe('ready');
    expect(vi.getTimerCount()).toBe(0); f.store.checkSession(); expect(f.detail).toHaveBeenCalledTimes(3);
  });
  it('validates references and release before token acquisition or detail requests', async () => {
    const f = setup(); await f.store.review(f.consent, f.inventory, [createResourceId('operation')], f.pin);
    expect(f.store.snapshot()).toMatchObject({ phase: 'error', code: 'backup/invalid-selection', draft: null });
    expect(f.capture).not.toHaveBeenCalled(); expect(f.detail).not.toHaveBeenCalled();
  });
  it('captures the selection before asynchronous work and does not accept caller mutations', async () => {
    const f = setup(), refs = [...f.references], consent = structuredClone(f.consent);
    const pending = f.store.review(consent, f.inventory, refs, f.pin); refs.length = 0;
    Object.assign(consent.preparation, { credential_id: 'Zg' }); await pending;
    expect(f.store.snapshot().phase).toBe('ready'); expect(f.detail).toHaveBeenCalledTimes(3);
  });
  it('discards old material after a selection change, even when the old transport ignores cancellation', async () => {
    const f = setup(); let resolve!: (value: typeof f.material[number]) => void;
    f.detail.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const old = f.review(); await Promise.resolve(); await f.review(); const latest = f.store.snapshot();
    expect(f.detail.mock.calls[0][1].aborted).toBe(true); resolve(f.material[0]); await old;
    expect(f.store.snapshot()).toBe(latest); expect(latest.phase).toBe('ready');
  });
  it('stops a stalled transport within 30 seconds, without showing previous or partial material', async () => {
    vi.useFakeTimers(); const f = setup(); await f.review();
    f.detail.mockImplementationOnce(() => new Promise(() => undefined));
    const pending = f.review(); expect(f.store.snapshot()).toEqual({ phase: 'loading', draft: null, code: null });
    await vi.advanceTimersByTimeAsync(30_000); await pending;
    expect(f.store.snapshot()).toEqual({ phase: 'error', draft: null, code: 'credentials/unavailable' });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('observes synchronous client failures, cancels sibling reads and permits an explicit retry', async () => {
    const f = setup(); f.detail.mockImplementationOnce(() => { throw new Error('Transport unavailable'); });
    await f.review(); expect(f.store.snapshot()).toMatchObject({ phase: 'error', draft: null });
    expect(f.detail.mock.calls[0][1].aborted).toBe(true); await f.review(); expect(f.store.snapshot().phase).toBe('ready');
  });
  it('clears a completed review on same-UID session replacement and will not auto-restart', async () => {
    const f = setup(); await f.review();
    f.assertCurrent.mockImplementation(() => { throw new Error('Session replaced'); }); f.store.checkSession();
    expect(f.store.snapshot()).toEqual({ phase: 'closed', draft: null, code: 'auth/session-changed' });
    await f.review(); expect(f.detail).toHaveBeenCalledTimes(3);
  });
  it('checks the session again before publishing details', async () => {
    const f = setup(), original = f.detail.getMockImplementation()!;
    f.detail.mockImplementation(async (...args) => {
      const value = await original(...args);
      f.assertCurrent.mockImplementation(() => { throw Object.assign(new Error('Signed out'), { code: 'auth/session-changed' }); });
      return value;
    });
    await f.review(); expect(f.store.snapshot()).toEqual({ phase: 'closed', draft: null, code: 'auth/session-changed' });
  });
  it('supports unmount/remount, removes private material and does not notify unsubscribed listeners', async () => {
    const f = setup(), listener = vi.fn(), unsubscribe = f.store.subscribe(listener);
    await f.review(); unsubscribe(); const count = listener.mock.calls.length; f.store.clear();
    expect(f.store.snapshot()).toEqual({ phase: 'idle', draft: null, code: null }); await f.review();
    expect(f.store.snapshot().phase).toBe('ready'); expect(listener).toHaveBeenCalledTimes(count);
  });
});
