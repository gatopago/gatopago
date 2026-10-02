import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseBackupCommitPreview } from '@gatopago/shared/v3/backup-wire';
import { parseResourceId } from '@gatopago/shared/v3/primitives';
import { BackupCommitFlow } from '../src/wallet/backup-commit-flow';
import { backupWireFixture } from './backup.fixture';
import type { BrowserAuth } from '../src/auth/browser';
import type { requestPasskeyProof } from '../src/wallet/passkeys';
import { isReloadBlocked } from '../src/pwa/reload-guard';

type Session = Awaited<ReturnType<BrowserAuth['backup']>>;
beforeEach(() => { vi.stubGlobal('window', {}); vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function fixture() {
  const t = backupWireFixture(), c = t.commit();
  let wire = { ...c.wire, state: 'prepared' as 'prepared' | 'authorized' };
  const read = (commitId: string) => {
    wire = { ...wire, commit_id: parseResourceId('operation', commitId) };
    return { wire: structuredClone(wire), preview: parseBackupCommitPreview(wire, t.choice, t.parent.wire, commitId) };
  };
  const session = {
    assertCurrent: vi.fn(),
    status: vi.fn<Session['status']>(),
    prepareCommit: vi.fn<Session['prepareCommit']>(async (_choice, _parent, id) => read(id)),
    restoreCommit: vi.fn<Session['restoreCommit']>(async (_choice, _parent, id) => read(id)),
    authorizeCommit: vi.fn<Session['authorizeCommit']>(async (_choice, _parent, _review, id) => {
      wire.state = 'authorized'; return { ...c.authorized, commit_id: parseResourceId('operation', id) };
    }),
  };
  const prove = vi.fn<typeof requestPasskeyProof>(async ({ challenge }) => {
    const proof = t.f.assertion(challenge);
    return { authenticator_data: Buffer.from(proof.authenticatorData).toString('base64url'),
      client_data: Buffer.from(proof.clientDataJSON).toString('base64url'), signature: Buffer.from(proof.signatureDER).toString('base64url') };
  });
  const capture = vi.fn(async () => session as unknown as Session);
  const newFlow = () => new BackupCommitFlow(capture, prove, { choice: t.choice, parent: t.parent });
  return { t, c, session, prove, capture, newFlow, flow: newFlow() };
}
describe('Final backup consent in Consumer', () => {
  it('keeps an accepted consent after a failed status read and retries without signing or submitting', async () => {
    const f = fixture(); await f.flow.prepare(); await f.flow.confirm(); await f.flow.authorize();
    f.session.status.mockRejectedValueOnce(new Error('unavailable'));
    await f.flow.checkProgress();
    expect(f.flow.snapshot()).toMatchObject({ phase: 'authorized', progress: null, error: 'backup/status-unavailable' });
    f.session.status.mockRejectedValueOnce(new Error('unavailable'));
    await f.flow.checkProgress();
    expect(f.session.status).toHaveBeenCalledTimes(2);
    expect(f.prove).toHaveBeenCalledTimes(1); expect(f.session.authorizeCommit).toHaveBeenCalledTimes(1);
    expect(isReloadBlocked()).toBe(false); f.flow.dispose();
  });
  it('stopping a status GET does not turn an accepted consent into an uncertain submission', async () => {
    const f = fixture(); await f.flow.prepare(); await f.flow.confirm(); await f.flow.authorize();
    f.session.status.mockReturnValueOnce(new Promise(() => {})); const task = f.flow.checkProgress();
    f.flow.stop(); await task;
    expect(f.flow.snapshot()).toMatchObject({ phase: 'authorized', error: 'backup/status-stopped', progress: null });
    expect(f.session.authorizeCommit).toHaveBeenCalledTimes(1); expect(isReloadBlocked()).toBe(false); f.flow.dispose();
  });
  it('discards pending progress when the session changes, without another ceremony or POST', async () => {
    const f = fixture(); await f.flow.prepare(); await f.flow.confirm(); await f.flow.authorize();
    f.session.status.mockReturnValueOnce(new Promise(() => {})); const task = f.flow.checkProgress();
    expect(f.session.status).toHaveBeenCalledTimes(1); f.flow.invalidate(); await task;
    expect(f.flow.snapshot()).toMatchObject({ phase: 'closed', progress: null });
    expect(f.prove).toHaveBeenCalledTimes(1); expect(f.session.authorizeCommit).toHaveBeenCalledTimes(1);
    expect(isReloadBlocked()).toBe(false);
  });
  it('is inert until action and uses a separate key gesture before a separate submit', async () => {
    const f = fixture(); expect(f.capture).not.toHaveBeenCalled(); await f.flow.confirm(); await f.flow.authorize();
    expect(f.prove).not.toHaveBeenCalled(); await f.flow.prepare();
    expect(f.flow.snapshot().phase).toBe('ready'); expect(f.session.authorizeCommit).not.toHaveBeenCalled();
    const confirmation = f.flow.confirm(); expect(f.prove).toHaveBeenCalledTimes(1); await confirmation;
    expect(f.prove.mock.calls[0][0].challenge).toBe(f.c.compiled.digest);
    expect(f.prove.mock.calls[0][0].challenge).not.toBe(f.t.compiled.digest);
    expect(f.session.authorizeCommit).not.toHaveBeenCalled(); await f.flow.authorize();
    expect(f.flow.snapshot()).toMatchObject({ phase: 'authorized', proofReady: false, submitted: false });
    expect(JSON.stringify(f.flow.snapshot())).not.toContain('signature'); expect(isReloadBlocked()).toBe(false); f.flow.dispose();
  });
  it('cannot begin from a merely prepared parent', () => {
    const f = fixture(); expect(() => new BackupCommitFlow(f.capture, f.prove, { choice: f.t.choice, parent: { wire: f.t.wire } })).toThrow();
  });
  it('never reuses the proposal signature for the final consent', async () => {
    const f = fixture(); await f.flow.prepare();
    const old = f.t.f.assertion(f.t.compiled.digest);
    f.prove.mockResolvedValueOnce({ authenticator_data: Buffer.from(old.authenticatorData).toString('base64url'),
      client_data: Buffer.from(old.clientDataJSON).toString('base64url'), signature: Buffer.from(old.signatureDER).toString('base64url') });
    await f.flow.confirm(); expect(f.flow.snapshot().proofReady).toBe(false); await f.flow.authorize();
    expect(f.session.authorizeCommit).not.toHaveBeenCalled(); f.flow.dispose();
  });
  it('reads before an explicit retry of identical signed bytes after an uncertain submit', async () => {
    const f = fixture(); await f.flow.prepare(); await f.flow.confirm();
    f.session.authorizeCommit.mockRejectedValueOnce(new Error('lost response'));
    await f.flow.authorize(); const first = structuredClone(f.session.authorizeCommit.mock.calls[0].slice(0, 5));
    await f.flow.authorize(); expect(f.session.authorizeCommit).toHaveBeenCalledTimes(1);
    await f.flow.restore(); await f.flow.confirm(); expect(f.prove).toHaveBeenCalledTimes(1);
    await f.flow.authorize(); expect(f.session.authorizeCommit.mock.calls[1].slice(0, 5)).toEqual(first);
    expect(f.flow.snapshot().phase).toBe('authorized'); f.flow.dispose();
  });
  it('restores authorized history after closing and expiry without signing or sending', async () => {
    const f = fixture(); await f.flow.prepare(); await f.flow.confirm(); await f.flow.authorize();
    const id = f.flow.snapshot().commitId!; f.flow.dispose(); await vi.advanceTimersByTimeAsync(400_000);
    const next = f.newFlow(); await next.restore(id); expect(next.snapshot().phase).toBe('authorized');
    await next.confirm(); await next.authorize(); expect(f.prove).toHaveBeenCalledTimes(1);
    expect(f.session.authorizeCommit).toHaveBeenCalledTimes(1); next.dispose();
  });
  it('keeps an expired uncertain submit uncertain instead of starting another operation', async () => {
    const f = fixture(); await f.flow.prepare(); await f.flow.confirm(); f.session.authorizeCommit.mockRejectedValueOnce(new Error('lost'));
    await f.flow.authorize(); await f.flow.restore(); await vi.advanceTimersByTimeAsync(400_000);
    expect(f.flow.snapshot()).toMatchObject({ phase: 'uncertain', submitted: true });
    await f.flow.prepare(); expect(f.session.prepareCommit).toHaveBeenCalledTimes(1); f.flow.dispose();
  });
  it('expires unsigned proofs and does not submit automatically', async () => {
    const f = fixture(); await f.flow.prepare(); await f.flow.confirm(); await vi.advanceTimersByTimeAsync(400_000);
    expect(f.flow.snapshot()).toMatchObject({ phase: 'expired', proofReady: false });
    await f.flow.authorize(); expect(f.session.authorizeCommit).not.toHaveBeenCalled(); f.flow.dispose();
  });
  it('bounds a stalled ceremony and discards late results after closing', async () => {
    const f = fixture(); await f.flow.prepare(); let resolve!: (v: Awaited<ReturnType<typeof f.prove>>) => void;
    f.prove.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const task = f.flow.confirm(); await f.flow.confirm(); expect(f.prove).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(90_000); await task; expect(f.flow.snapshot().phase).toBe('ready');
    expect(isReloadBlocked()).toBe(false); f.flow.invalidate();
    resolve(await f.prove(f.prove.mock.calls[0][0])); await Promise.resolve();
    expect(f.flow.snapshot()).toMatchObject({ phase: 'closed', proofReady: false });
  });
  it('rejects a late preparation result after the session changes', async () => {
    const f = fixture(); let resolve!: (v: Awaited<ReturnType<Session['prepareCommit']>>) => void;
    f.session.prepareCommit.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const task = f.flow.prepare(); await Promise.resolve(); await Promise.resolve();
    f.session.assertCurrent.mockImplementation(() => { throw Object.assign(new Error('changed'), { code: 'auth/session-changed' }); });
    f.flow.checkSession(); await task;
    resolve({ wire: f.c.wire, preview: parseBackupCommitPreview(f.c.wire, f.t.choice, f.t.parent.wire, f.c.commitId) });
    await Promise.resolve(); expect(f.flow.snapshot().phase).toBe('closed'); expect(isReloadBlocked()).toBe(false);
  });
  it('survives the Strict Mode effect cleanup rehearsal without network or ceremonies', async () => {
    const f = fixture(); f.flow.dispose(); f.flow.checkSession();
    expect(f.capture).not.toHaveBeenCalled(); expect(f.prove).not.toHaveBeenCalled();
    await f.flow.prepare(); expect(f.flow.snapshot().phase).toBe('ready'); f.flow.dispose();
  });
});
