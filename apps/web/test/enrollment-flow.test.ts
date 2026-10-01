import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EnrollmentFlow } from '../src/wallet/enrollment-flow';
import type { PreparedEnrollment } from '../src/wallet/enrollment';
import { isReloadBlocked } from '../src/pwa/reload-guard';

const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };
function fixture() {
  const prepared: PreparedEnrollment = { kind: 'prepared', id: 'op_fixture', scope: { rpId: 'localhost', origin: 'http://localhost:4178' },
    challenge: `0x${'01'.repeat(32)}`, proofChallenge: `0x${'02'.repeat(32)}`, userHandle: 'fixture', userName: 'GatoPago 12345678',
    excludeCredentials: [], validUntilMs: Date.now() + 300_000 };
  const registered = { key: `0x${'01'.repeat(128)}` as `0x${string}`, registration: { credential_id: 'fixture', client_data: 'e30', attestation: 'oA', transports: ['internal'] } };
  const session = { assertCurrent: vi.fn(), prepare: vi.fn().mockResolvedValue(prepared), complete: vi.fn().mockResolvedValue({ kind: 'enrolled', id: prepared.id }) };
  const capture = vi.fn(() => session);
  const ceremonies = { create: vi.fn().mockResolvedValue(registered), prove: vi.fn().mockResolvedValue({ authenticator_data: 'AA', client_data: 'e30', signature: 'MA' }) };
  return { flow: new EnrollmentFlow(capture, ceremonies), capture, session, ceremonies, registered, prepared };
}
beforeEach(() => { vi.stubGlobal('window', {}); vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Component-owned enrollment state machine (ceremonies and identity mocked)', () => {
  it('does nothing on construction, subscription or entering security', () => {
    const { flow, capture, ceremonies } = fixture(); const remove = flow.subscribe(vi.fn());
    flow.checkSession(); expect(flow.snapshot().phase).toBe('idle'); expect(capture).not.toHaveBeenCalled(); expect(ceremonies.create).not.toHaveBeenCalled(); remove();
  });
  it('requires separate create and proof gestures and confirms only after the server', async () => {
    const { flow, session, ceremonies } = fixture();
    await flow.prepare(); expect(flow.snapshot().phase).toBe('ready'); expect(ceremonies.create).not.toHaveBeenCalled();
    const creating = flow.create('default'); expect(ceremonies.create).toHaveBeenCalledOnce(); // Called synchronously, before yielding user backup.
    expect(isReloadBlocked()).toBe(true); await creating;
    expect(flow.snapshot().phase).toBe('proof'); expect(ceremonies.prove).not.toHaveBeenCalled(); expect(session.complete).not.toHaveBeenCalled();
    const proving = flow.prove(); expect(ceremonies.prove).toHaveBeenCalledOnce(); await proving;
    expect(flow.snapshot().phase).toBe('done'); expect(session.complete).toHaveBeenCalledOnce(); expect(isReloadBlocked()).toBe(false);
    expect(ceremonies.prove.mock.calls[0][0]).toMatchObject({ challenge: `0x${'02'.repeat(32)}`, credentialId: 'fixture' });
  });
  it('ignores double clicks in each stage and never creates from an invalid stage', async () => {
    const { flow, session, ceremonies } = fixture();
    await flow.create('default'); await flow.prove();
    const first = flow.prepare(); await flow.prepare(); await first; expect(session.prepare).toHaveBeenCalledOnce();
    const create = flow.create('security-key'); await flow.create('default'); await create; expect(ceremonies.create).toHaveBeenCalledOnce();
    const proof = flow.prove(); await flow.prove(); await proof; expect(ceremonies.prove).toHaveBeenCalledOnce();
  });
  it('keeps the request ID on an uncertain prepare and changes it only after explicit cancellation', async () => {
    const { flow, session } = fixture(); session.prepare.mockRejectedValueOnce(new Error('network'));
    await flow.prepare(); expect(flow.snapshot().phase).toBe('idle'); await flow.prepare();
    expect(session.prepare.mock.calls[0][0]).toBe(session.prepare.mock.calls[1][0]);
    flow.cancel(); await flow.prepare(); expect(session.prepare.mock.calls[2][0]).not.toBe(session.prepare.mock.calls[0][0]);
  });
  it('retries only the identical completion proof after an uncertain response, even after expiry', async () => {
    const { flow, session, ceremonies } = fixture(); session.complete.mockRejectedValueOnce(new Error('network'));
    await flow.prepare(); await flow.create('default'); await flow.prove(); expect(flow.snapshot().phase).toBe('retry');
    await vi.advanceTimersByTimeAsync(301000); await flow.retry(); expect(flow.snapshot().phase).toBe('done');
    expect(session.complete.mock.calls[0].slice(0, 2)).toEqual(session.complete.mock.calls[1].slice(0, 2));
    expect(ceremonies.create).toHaveBeenCalledOnce(); expect(ceremonies.prove).toHaveBeenCalledOnce();
  });
  it('keeps the created key when the user cancels proof, without asking to create it again', async () => {
    const { flow, ceremonies, session } = fixture(); ceremonies.prove.mockRejectedValueOnce({ code: 'cancelled' });
    await flow.prepare(); await flow.create('default'); await flow.prove();
    expect(flow.snapshot()).toMatchObject({ phase: 'proof', error: 'cancelled', keyMayExist: true }); expect(session.complete).not.toHaveBeenCalled();
    await flow.prove(); expect(flow.snapshot().phase).toBe('done'); expect(ceremonies.create).toHaveBeenCalledOnce();
  });
  it('invalidates a captured session before any browser gesture or HTTP completion', async () => {
    const { flow, session, ceremonies } = fixture(); await flow.prepare();
    session.assertCurrent.mockImplementation(() => { throw { code: 'auth/session-changed' }; });
    await flow.create('default'); expect(flow.snapshot().phase).toBe('closed'); expect(ceremonies.create).not.toHaveBeenCalled();
    flow.cancel(); await flow.prepare(); expect(flow.snapshot().phase).toBe('closed');
  });
  it('does not submit a late created key after switching identities', async () => {
    const { flow, session, ceremonies, registered } = fixture(); const late = deferred<typeof registered>(); ceremonies.create.mockReturnValueOnce(late.promise);
    await flow.prepare(); const pending = flow.create('default'); flow.invalidate(); late.resolve(registered); await pending;
    expect(flow.snapshot().phase).toBe('closed'); expect(session.complete).not.toHaveBeenCalled(); expect(ceremonies.prove).not.toHaveBeenCalled(); expect(isReloadBlocked()).toBe(false);
  });
  it('does not accept a late confirmation after cancellation/unmount', async () => {
    const { flow, session } = fixture(); const late = deferred<unknown>(); session.complete.mockReturnValueOnce(late.promise);
    await flow.prepare(); await flow.create('default'); const pending = flow.prove();
    await Promise.resolve(); expect(flow.snapshot().phase).toBe('submitting'); flow.cancel(); late.resolve({ kind: 'enrolled' }); await pending;
    expect(flow.snapshot()).toMatchObject({ phase: 'idle', keyMayExist: true }); expect(isReloadBlocked()).toBe(false);
  });
  it('does not let a cancelled preparation overwrite a newer one', async () => {
    const { flow, session, prepared } = fixture(); const late = deferred<PreparedEnrollment>(); session.prepare.mockReturnValueOnce(late.promise);
    const old = flow.prepare(); flow.cancel(); await flow.prepare(); late.resolve(prepared); await old;
    expect(flow.snapshot().phase).toBe('ready'); expect(session.prepare).toHaveBeenCalledTimes(2);
  });
  it('releases the PWA reload guard on cancellation even if an underlying adapter never responds', async () => {
    const { flow, session } = fixture(); session.prepare.mockReturnValueOnce(new Promise(() => undefined));
    const pending = flow.prepare(); expect(isReloadBlocked()).toBe(true); flow.cancel(); await pending;
    expect(flow.snapshot().phase).toBe('idle'); expect(isReloadBlocked()).toBe(false);
  });
  it('requires restarting expired or rejected registrations rather than silently extending them', async () => {
    const { flow, ceremonies } = fixture(); await flow.prepare(); await vi.advanceTimersByTimeAsync(300000);
    expect(flow.snapshot()).toMatchObject({ phase: 'restart', error: 'enrollment/expired' });
    await flow.create('default'); expect(ceremonies.create).not.toHaveBeenCalled();
  });
  it('does not treat a duplicate credential as a missing key or launch recovery', async () => {
    const { flow, ceremonies, session } = fixture(); ceremonies.create.mockRejectedValueOnce({ code: 'already-registered' });
    await flow.prepare(); await flow.create('default');
    expect(flow.snapshot()).toMatchObject({ phase: 'restart', error: 'already-registered' }); expect(session.complete).not.toHaveBeenCalled(); expect(ceremonies.prove).not.toHaveBeenCalled();
  });
});
