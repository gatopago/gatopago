import { parseEnvironment } from '@gatopago/environment';
import environments from '@gatopago/environment/environments.json';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createResourceId } from '@gatopago/shared/v3/primitives';
import { prepareInitialization } from '@gatopago/shared/v3/initialization';
import type { CredentialInventory } from '@gatopago/shared/v3/credential-inventory';
import type { BrowserAuth } from '../src/auth/browser';
import { InitializationFlow } from '../src/wallet/initialization-flow';
import { creationProfileForRelease } from '../src/wallet/creation-release';
import { isReloadBlocked } from '../src/pwa/reload-guard';
import { initializationFixture } from '@gatopago/test-fixtures/v3-initialization';

type Session = Awaited<ReturnType<BrowserAuth['initialization']>>;
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
function fixture() {
  const f = initializationFixture(),
    credentialRef = createResourceId('operation');
  const inventory: CredentialInventory = {
    scope: { ...f.input.scope },
    data: [
      {
        credential_ref: credentialRef,
        created_at: 123,
        transports: ['internal'],
        aaguid: '00000000-0000-0000-0000-000000000000',
        backup_eligible: true,
        backed_up_at_registration: true,
      },
    ],
    device_availability: 'unknown',
    onchain_authority: 'not_assessed',
  };
  const session = {
    assertCurrent: vi.fn(),
    prepare: vi.fn<Session['prepare']>(),
    authorize: vi.fn<Session['authorize']>(),
    history: vi.fn<Session['history']>(),
    restore: vi.fn<Session['restore']>(),
  };
  session.prepare.mockImplementation(async (request) => {
    const input = { ...f.input, userSaltCommitment: request.user_salt_commitment },
      prepared = prepareInitialization(input);
    return {
      preparation: {
        initialization_id: request.request_id as `op_${string}`,
        state: 'prepared',
        approval_digest: prepared.digest,
        profile_sha256: f.pin.digest,
        credential_ref: credentialRef,
        credential_id: 'c3ludGhldGlj',
        public_key: input.publicKey,
        valid_after: input.validAfter,
        valid_until: input.validUntil,
        account_deployed: false,
        receive_enabled: false,
        spend_enabled: false,
      },
      expected: {
        id: request.request_id as `op_${string}`,
        credentialRef,
        document: f.pin.document,
        profileDigest: f.pin.digest,
        scope: input.scope,
        userSaltCommitment: input.userSaltCommitment,
      },
    };
  });
  session.authorize.mockImplementation(async (consent) => ({
    initialization_id: consent.preparation.initialization_id,
    state: 'authorized',
    approval_digest: consent.preparation.approval_digest,
    profile_sha256: f.pin.digest,
    account_deployed: false,
    receive_enabled: false,
    spend_enabled: false,
  }));
  const capture = vi.fn<() => Promise<Session>>(async () => session);
  const prove = vi.fn(async ({ challenge }: { challenge: `0x${string}` }) => {
    const response = f.assertion(challenge);
    return {
      authenticator_data: Buffer.from(response.authenticatorData).toString('base64url'),
      client_data: Buffer.from(response.clientDataJSON).toString('base64url'),
      signature: Buffer.from(response.signatureDER).toString('base64url'),
    };
  });
  return {
    f,
    inventory,
    session,
    capture,
    prove,
    credentialRef,
    flow: new InitializationFlow(capture, prove, f.pin, inventory),
  };
}
beforeEach(() => {
  vi.stubGlobal('window', {});
  vi.useFakeTimers();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('component-owned initialization consent; HTTP/session mocked, real typed digest', () => {
  it('passes only verified authorized public consent to the creation operation and clears it on session replacement', async () => {
    const t = fixture();
    await t.flow.prepare(t.credentialRef);
    expect(t.flow.snapshot().consent).toBeNull();
    await t.flow.confirm();
    const consent = t.flow.snapshot().consent!;
    expect(consent.preparation.state).toBe('authorized');
    expect(consent.expected.profileDigest).toBe(t.f.pin.digest);
    expect(consent.preparation.approval_digest).toBe(t.flow.snapshot().review!.digest);
    expect(consent).not.toHaveProperty('proof');
    expect(consent).not.toHaveProperty('initial_assertion');
    t.session.assertCurrent.mockImplementation(() => {
      throw Object.assign(new Error('session changed'), { code: 'auth/session-changed' });
    });
    t.flow.checkSession();
    expect(t.flow.snapshot()).toMatchObject({ phase: 'closed', consent: null });
  });
  it('does not expose consent if the authorization reply is inconsistent', async () => {
    const t = fixture();
    await t.flow.prepare(t.credentialRef);
    t.session.authorize.mockResolvedValueOnce({ state: 'authorized' } as never);
    await t.flow.confirm();
    expect(t.flow.snapshot().consent).toBeNull();
  });
  it('does not initialize a session or invoke a ceremony on construction, subscription or mount', () => {
    const t = fixture();
    const remove = t.flow.subscribe(vi.fn());
    t.flow.checkSession();
    expect(t.capture).not.toHaveBeenCalled();
    expect(t.prove).not.toHaveBeenCalled();
    expect(t.flow.snapshot().phase).toBe('idle');
    remove();
    expect(creationProfileForRelease(parseEnvironment(environments.production))).not.toBeNull();
    expect(
      creationProfileForRelease(
        parseEnvironment({ ...environments.production, wallet_enabled: [] }),
      ),
    ).toBeNull();
  });
  it('shows recomputed consent and calls WebAuthn synchronously only from confirmation', async () => {
    const t = fixture();
    await t.flow.prepare(t.credentialRef);
    expect(t.flow.snapshot()).toMatchObject({
      phase: 'ready',
      review: { credentialRef: t.credentialRef, network: 'eip155:84532', generation: 3 },
    });
    expect(t.prove).not.toHaveBeenCalled();
    expect(t.session.authorize).not.toHaveBeenCalled();
    const pending = t.flow.confirm();
    expect(t.prove).toHaveBeenCalledOnce();
    expect(isReloadBlocked()).toBe(true);
    await pending;
    expect(t.flow.snapshot().phase).toBe('done');
    expect(t.flow.snapshot()).not.toHaveProperty('receiveEnabled');
    expect(isReloadBlocked()).toBe(false);
    expect(t.prove.mock.calls[0][0]).toMatchObject({
      challenge: t.flow.snapshot().review!.digest,
      credentialId: 'c3ludGhldGlj',
    });
  });
  it('ignores duplicate or out-of-order clicks', async () => {
    const t = fixture();
    await t.flow.confirm();
    await t.flow.retry();
    expect(t.prove).not.toHaveBeenCalled();
    const first = t.flow.prepare(t.credentialRef);
    await t.flow.prepare(t.credentialRef);
    await first;
    const confirmation = t.flow.confirm();
    await t.flow.confirm();
    await confirmation;
    expect(t.session.prepare).toHaveBeenCalledOnce();
    expect(t.prove).toHaveBeenCalledOnce();
    expect(t.session.authorize).toHaveBeenCalledOnce();
  });
  it('does not prepare a credential outside the captured inventory', async () => {
    const t = fixture();
    await t.flow.prepare(createResourceId('operation'));
    expect(t.flow.snapshot()).toMatchObject({ phase: 'restart', error: 'initialization/invalid' });
    expect(t.capture).not.toHaveBeenCalled();
  });
  it('detaches inventory and pin from caller mutation', async () => {
    const t = fixture();
    (t.inventory as { scope: unknown }).scope = { rpId: 'evil.test', origin: 'https://evil.test' };
    t.f.pin.document = '{}';
    await t.flow.prepare(t.credentialRef);
    expect(t.flow.snapshot().phase).toBe('ready');
  });
  it('keeps request ID and salt after uncertain preparation, replacing only after explicit cancel', async () => {
    const t = fixture();
    t.session.prepare.mockRejectedValueOnce(new Error('network'));
    await t.flow.prepare(t.credentialRef);
    expect(t.flow.snapshot().phase).toBe('prepare-retry');
    await t.flow.prepare(t.credentialRef);
    expect(t.session.prepare.mock.calls[0][0]).toEqual(t.session.prepare.mock.calls[1][0]);
    t.flow.cancel();
    await t.flow.prepare(t.credentialRef);
    expect(t.session.prepare.mock.calls[2][0]).not.toEqual(t.session.prepare.mock.calls[0][0]);
  });
  it('rejects a changed digest even if response.expected tries to change the salt', async () => {
    const t = fixture(),
      prepare = t.session.prepare.getMockImplementation()!;
    t.session.prepare.mockImplementationOnce(async (request, signal) =>
      prepare({ ...request, user_salt_commitment: `0x${'a'.repeat(64)}` }, signal),
    );
    await t.flow.prepare(t.credentialRef);
    expect(t.flow.snapshot()).toMatchObject({ phase: 'restart', error: 'initialization/invalid' });
    expect(t.prove).not.toHaveBeenCalled();
  });
  it('recovers an already authorized preparation without asking for another signature', async () => {
    const t = fixture(),
      prepare = t.session.prepare.getMockImplementation()!;
    t.session.prepare.mockImplementationOnce(async (...args) => {
      const result = await prepare(...args);
      return { ...result, preparation: { ...result.preparation, state: 'authorized' } };
    });
    await t.flow.prepare(t.credentialRef);
    expect(t.flow.snapshot().phase).toBe('done');
    expect(t.prove).not.toHaveBeenCalled();
    expect(t.session.authorize).not.toHaveBeenCalled();
  });
  it('expires waiting consent without signing or extending it automatically', async () => {
    const t = fixture();
    await t.flow.prepare(t.credentialRef);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(t.flow.snapshot()).toMatchObject({ phase: 'restart', error: 'initialization/expired' });
    await t.flow.confirm();
    expect(t.prove).not.toHaveBeenCalled();
  });
  it('keeps the selected key after a dismissed ceremony and does not start recovery', async () => {
    const t = fixture();
    t.prove.mockRejectedValueOnce({ code: 'cancelled' });
    await t.flow.prepare(t.credentialRef);
    await t.flow.confirm();
    expect(t.flow.snapshot()).toMatchObject({
      phase: 'ready',
      error: 'cancelled',
      submissionStarted: false,
    });
    expect(t.session.authorize).not.toHaveBeenCalled();
    await t.flow.confirm();
    expect(t.flow.snapshot().phase).toBe('done');
    expect(t.session.prepare).toHaveBeenCalledOnce();
  });
  it('replays exactly the same proof after uncertain submission, including after expiry', async () => {
    const t = fixture();
    t.session.authorize.mockRejectedValueOnce(new Error('network'));
    await t.flow.prepare(t.credentialRef);
    await t.flow.confirm();
    expect(t.flow.snapshot().phase).toBe('retry');
    await vi.advanceTimersByTimeAsync(301_000);
    await t.flow.retry();
    expect(t.flow.snapshot().phase).toBe('done');
    expect(t.prove).toHaveBeenCalledOnce();
    expect(t.session.authorize.mock.calls[0].slice(0, 2)).toEqual(
      t.session.authorize.mock.calls[1].slice(0, 2),
    );
  });
  it('stopping an in-flight submission preserves the same proof and cannot start another request', async () => {
    const t = fixture(),
      late = deferred<Awaited<ReturnType<Session['authorize']>>>();
    t.session.authorize.mockReturnValueOnce(late.promise);
    await t.flow.prepare(t.credentialRef);
    const pending = t.flow.confirm();
    await Promise.resolve();
    t.flow.cancel();
    await pending;
    expect(t.flow.snapshot()).toMatchObject({
      phase: 'retry',
      error: 'initialization/result-unknown',
    });
    await t.flow.prepare(t.credentialRef);
    expect(t.session.prepare).toHaveBeenCalledOnce();
    await t.flow.retry();
    late.resolve(
      await t.session.authorize.getMockImplementation()!(...t.session.authorize.mock.calls[0]),
    );
    await Promise.resolve();
    expect(t.flow.snapshot().phase).toBe('done');
    expect(t.prove).toHaveBeenCalledOnce();
    expect(isReloadBlocked()).toBe(false);
  });
  it('cancels a delayed module/session load without allowing it to prepare later', async () => {
    const t = fixture(),
      late = deferred<Session>();
    t.capture.mockReturnValueOnce(late.promise);
    const pending = t.flow.prepare(t.credentialRef);
    t.flow.cancel();
    late.resolve(t.session);
    await pending;
    expect(t.flow.snapshot().phase).toBe('idle');
    expect(t.session.prepare).not.toHaveBeenCalled();
    expect(isReloadBlocked()).toBe(false);
  });
  it('times out an unresponsive session load and permits retry of the same request', async () => {
    const t = fixture();
    t.capture.mockReturnValueOnce(new Promise(() => undefined));
    const pending = t.flow.prepare(t.credentialRef);
    await vi.advanceTimersByTimeAsync(30_000);
    await pending;
    expect(t.flow.snapshot()).toMatchObject({
      phase: 'prepare-retry',
      error: 'initialization/timeout',
    });
    expect(isReloadBlocked()).toBe(false);
    await t.flow.prepare(t.credentialRef);
    expect(t.flow.snapshot().phase).toBe('ready');
  });
  it('ignores a stale prepare response after a new flow starts', async () => {
    const t = fixture(),
      late = deferred<Awaited<ReturnType<Session['prepare']>>>(),
      prepare = t.session.prepare.getMockImplementation()!;
    t.session.prepare.mockReturnValueOnce(late.promise);
    const old = t.flow.prepare(t.credentialRef);
    await Promise.resolve();
    t.flow.cancel();
    await t.flow.prepare(t.credentialRef);
    const reference = t.flow.snapshot().reference;
    late.resolve(await prepare(...t.session.prepare.mock.calls[0]));
    await old;
    expect(t.flow.snapshot()).toMatchObject({ phase: 'ready', reference });
    expect(isReloadBlocked()).toBe(false);
  });
  it('invalidates the captured identity before confirmation', async () => {
    const t = fixture();
    await t.flow.prepare(t.credentialRef);
    t.session.assertCurrent.mockImplementation(() => {
      throw { code: 'auth/session-changed' };
    });
    await t.flow.confirm();
    expect(t.prove).not.toHaveBeenCalled();
    expect(t.flow.snapshot()).toMatchObject({ phase: 'closed', review: null });
    t.flow.cancel();
    t.flow.dispose();
    await t.flow.prepare(t.credentialRef);
    expect(t.flow.snapshot().phase).toBe('closed');
  });
  it('does not submit a late proof after identity change', async () => {
    const t = fixture(),
      late = deferred<Awaited<ReturnType<typeof t.prove>>>();
    t.prove.mockReturnValueOnce(late.promise);
    await t.flow.prepare(t.credentialRef);
    const pending = t.flow.confirm();
    t.flow.invalidate();
    late.resolve(await t.prove.getMockImplementation()!(t.prove.mock.calls[0][0]));
    await pending;
    expect(t.session.authorize).not.toHaveBeenCalled();
    expect(t.flow.snapshot()).toMatchObject({ phase: 'closed', review: null });
    expect(isReloadBlocked()).toBe(false);
  });
  it('cleans up on unmount and tolerates StrictMode effect reconnection without ceremonies', async () => {
    const t = fixture();
    t.flow.dispose();
    t.flow.checkSession();
    expect(t.capture).not.toHaveBeenCalled();
    await t.flow.prepare(t.credentialRef);
    t.flow.dispose();
    expect(t.flow.snapshot()).toMatchObject({ phase: 'idle', review: null });
    await t.flow.confirm();
    expect(t.prove).not.toHaveBeenCalled();
    expect(isReloadBlocked()).toBe(false);
  });
  it('refuses a receipt claiming deployment or financial availability', async () => {
    const t = fixture(),
      authorize = t.session.authorize.getMockImplementation()!;
    t.session.authorize.mockImplementationOnce(
      async (...args) => ({ ...(await authorize(...args)), receive_enabled: true }) as never,
    );
    await t.flow.prepare(t.credentialRef);
    await t.flow.confirm();
    expect(t.flow.snapshot()).toMatchObject({ phase: 'restart', error: 'initialization/invalid' });
  });
});

describe('restore in a new component without saved browser signatures', () => {
  async function restored(state: 'prepared' | 'authorized' = 'prepared', recorded = false) {
    const t = fixture();
    const consent = await t.session.prepare.getMockImplementation()!(
      {
        request_id: createResourceId('operation'),
        credential_ref: t.credentialRef,
        user_salt_commitment: t.f.input.userSaltCommitment,
      },
      new AbortController().signal,
    );
    const response = {
      consent: { ...consent, preparation: { ...consent.preparation, state } },
      creationOperationRecorded: recorded,
    };
    t.session.restore.mockResolvedValue(response);
    const item = {
      initialization_id: consent.preparation.initialization_id,
      credential_ref: t.credentialRef,
      profile_sha256: t.f.pin.digest,
      approval_digest: consent.preparation.approval_digest,
      created_at: consent.preparation.valid_after,
      expires_at: consent.preparation.valid_until,
      state,
      creation_operation_recorded: recorded,
    };
    return { ...t, item, response };
  }
  it('restores unsigned inputs and requires a separate explicit confirmation', async () => {
    const t = await restored();
    await t.flow.restore(t.item);
    expect(t.flow.snapshot()).toMatchObject({
      phase: 'ready',
      reference: t.item.initialization_id,
    });
    expect(t.session.prepare).not.toHaveBeenCalled();
    expect(t.prove).not.toHaveBeenCalled();
    expect(t.session.authorize).not.toHaveBeenCalled();
    const pending = t.flow.confirm();
    expect(t.prove).toHaveBeenCalledOnce();
    await pending;
    expect(t.flow.snapshot().phase).toBe('done');
    expect(t.session.authorize.mock.calls[0][0]).toEqual(t.response.consent);
  });
  it.each([false, true])(
    'restores recorded authorization (creation operation: %s) without any mutation',
    async (recorded) => {
      const t = await restored('authorized', recorded);
      await vi.advanceTimersByTimeAsync(301_000);
      await t.flow.restore(t.item);
      expect(t.flow.snapshot().phase).toBe(recorded ? 'operation-recorded' : 'done');
      await t.flow.confirm();
      await t.flow.prepare(t.credentialRef);
      await t.flow.retry();
      expect(t.prove).not.toHaveBeenCalled();
      expect(t.session.prepare).not.toHaveBeenCalled();
      expect(t.session.authorize).not.toHaveBeenCalled();
    },
  );
  it('expires restored unsigned inputs without extending the saved window', async () => {
    const t = await restored();
    await vi.advanceTimersByTimeAsync(301_000);
    await t.flow.restore({ ...t.item, state: 'expired' });
    expect(t.flow.snapshot()).toMatchObject({ phase: 'restart', error: 'initialization/expired' });
    await t.flow.confirm();
    expect(t.prove).not.toHaveBeenCalled();
  });
  it('does not accept substituted salt or a regressed authorization', async () => {
    const t = await restored('authorized');
    t.session.restore.mockResolvedValueOnce({
      ...t.response,
      consent: {
        ...t.response.consent,
        preparation: { ...t.response.consent.preparation, state: 'prepared' },
      },
    });
    await t.flow.restore(t.item);
    expect(t.flow.snapshot()).toMatchObject({ phase: 'restart', error: 'initialization/invalid' });
    t.flow.dispose();
    t.session.restore.mockResolvedValueOnce({
      ...t.response,
      consent: {
        ...t.response.consent,
        expected: { ...t.response.consent.expected, userSaltCommitment: `0x${'a'.repeat(64)}` },
      },
    });
    await t.flow.restore(t.item);
    expect(t.flow.snapshot().phase).toBe('restart');
    expect(t.prove).not.toHaveBeenCalled();
  });
  it('rejects a stale restoration after cancellation or a changed captured session', async () => {
    const t = await restored(),
      late = deferred<Awaited<ReturnType<Session['restore']>>>();
    t.session.restore.mockReturnValueOnce(late.promise);
    const pending = t.flow.restore(t.item);
    await Promise.resolve();
    t.flow.cancel();
    late.resolve(t.response);
    await pending;
    expect(t.flow.snapshot()).toMatchObject({ phase: 'idle', review: null });
    t.session.assertCurrent.mockImplementation(() => {
      throw { code: 'auth/session-changed' };
    });
    await t.flow.restore(t.item);
    expect(t.flow.snapshot().phase).toBe('closed');
    expect(t.prove).not.toHaveBeenCalled();
  });
  it('retries only the selected GET after timeout, including StrictMode reconnection', async () => {
    const t = await restored();
    t.session.restore.mockReturnValueOnce(new Promise(() => undefined));
    const pending = t.flow.restore(t.item);
    await vi.advanceTimersByTimeAsync(30_000);
    await pending;
    expect(t.flow.snapshot().phase).toBe('restore-retry');
    await t.flow.restore(t.item);
    expect(t.flow.snapshot().phase).toBe('ready');
    t.flow.dispose();
    await t.flow.restore(t.item);
    expect(t.session.prepare).not.toHaveBeenCalled();
    expect(t.prove).not.toHaveBeenCalled();
    t.flow.dispose();
    expect(isReloadBlocked()).toBe(false);
  });
});
