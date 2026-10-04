import { afterEach, describe, expect, it, vi } from 'vitest';
import environments from '@gatopago/environment/environments.json';
import { parseEnvironment } from '@gatopago/environment';
import { createResourceId } from '@gatopago/shared/v3/primitives';
import { prepareInitialization } from '@gatopago/shared/v3/initialization';
import {
  parseInitializationHistory,
  parseInitializationPreparation,
  parseInitializationProof,
} from '@gatopago/shared/v3/initialization-wire';
import { CLIENT_RELEASE_HEADERS } from '@gatopago/shared/v3/client-release';
import { initializationClient } from '../src/wallet/initialization';
import { buildAuthConfig, type EnabledAuthConfig } from '../src/auth/config';
import { initializationFixture } from '@gatopago/test-fixtures/v3-initialization';
import { fixtureHash } from '@gatopago/test-fixtures/v3-inspection';

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
const signal = () => new AbortController().signal;
function fixture() {
  const f = initializationFixture(),
    id = createResourceId('operation'),
    credentialRef = createResourceId('operation');
  const approval = prepareInitialization(f.input);
  const expected = {
    id,
    credentialRef,
    document: f.pin.document,
    profileDigest: f.pin.digest,
    userSaltCommitment: f.input.userSaltCommitment,
    scope: f.input.scope,
  };
  const receipt = {
    initialization_id: id,
    state: 'prepared',
    approval_digest: approval.digest,
    profile_sha256: f.pin.digest,
    account_deployed: false,
    receive_enabled: false,
    spend_enabled: false,
  };
  const value = {
    ...receipt,
    credential_ref: credentialRef,
    credential_id: Buffer.from('synthetic-id').toString('base64url'),
    public_key: f.input.publicKey,
    valid_after: f.input.validAfter,
    valid_until: f.input.validUntil,
  };
  const p = f.assertion(approval.digest),
    proof = {
      authenticator_data: Buffer.from(p.authenticatorData).toString('base64url'),
      client_data: Buffer.from(p.clientDataJSON).toString('base64url'),
      signature: Buffer.from(p.signatureDER).toString('base64url'),
    };
  const token = vi.fn(async () => 'synthetic.token.signature');
  return {
    f,
    expected,
    receipt,
    value,
    proof,
    token,
    client: initializationClient(config, token, f.pin),
    request: {
      request_id: id,
      credential_ref: credentialRef,
      user_salt_commitment: f.input.userSaltCommitment,
    },
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('typed initialization client, no implicit ceremony or broadcast', () => {
  it('does no I/O on construction, pins the account version and reconstructs the response before accepting it', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const t = fixture();
    expect(t.token).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue(Response.json(t.value));
    const result = await t.client.prepare(t.request, signal());
    expect(result.preparation).toEqual(t.value);
    expect(Object.isFrozen(result.expected.scope)).toBe(true);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      `${environments.production.api_origin}/app/v1/account-initializations`,
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        headers: expect.objectContaining({
          [CLIENT_RELEASE_HEADERS.generation]: '3',
          [CLIENT_RELEASE_HEADERS.manifest]: t.f.profile.deployment.manifest_id,
        }),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      ...t.request,
      profile_sha256: t.f.pin.digest,
    });
  });
  it('submits only the explicit proof and accepts only its exact authorized receipt', async () => {
    const t = fixture(),
      fetchMock = vi
        .fn()
        .mockResolvedValueOnce(Response.json(t.value))
        .mockResolvedValueOnce(Response.json({ ...t.receipt, state: 'authorized' }));
    vi.stubGlobal('fetch', fetchMock);
    const consent = await t.client.prepare(t.request, signal());
    expect(await t.client.authorize(consent, t.proof, signal())).toEqual({
      ...t.receipt,
      state: 'authorized',
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      `${environments.production.api_origin}/app/v1/account-initializations/${t.request.request_id}/authorize`,
    );
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(t.proof);
  });
  it.each([
    'id',
    'key',
    'reference',
    'credential-id',
    'digest',
    'scope',
    'salt',
    'manifest',
    'lifetime',
    'receive',
    'spend',
    'deployed',
    'extra',
  ])('rejects altered %s in the consent', (change) => {
    const t = fixture(),
      value: Record<string, unknown> = { ...t.value },
      expected = { ...t.expected };
    if (change === 'id') value.initialization_id = createResourceId('operation');
    if (change === 'key') value.public_key = initializationFixture().input.publicKey;
    if (change === 'reference') value.credential_ref = createResourceId('operation');
    if (change === 'credential-id') value.credential_id = 'abc=';
    if (change === 'digest') value.approval_digest = fixtureHash('a');
    if (change === 'scope')
      expected.scope = { rpId: 'other.gatopago.com', origin: 'https://other.gatopago.com' };
    if (change === 'salt') expected.userSaltCommitment = fixtureHash('a');
    if (change === 'manifest') expected.profileDigest = fixtureHash('a');
    if (change === 'lifetime') value.valid_until = t.value.valid_after + 301;
    if (change === 'receive') value.receive_enabled = true;
    if (change === 'spend') value.spend_enabled = true;
    if (change === 'deployed') value.account_deployed = true;
    if (change === 'extra') value.document = t.f.pin.document;
    expect(() => parseInitializationPreparation(value, expected)).toThrow();
  });
  it.each([401, 409, 410, 429, 503])(
    'does not retry or auto-create a profile after status %s',
    async (status) => {
      const t = fixture(),
        fetchMock = vi
          .fn()
          .mockResolvedValue(Response.json({ error_code: 'UNAVAILABLE' }, { status }));
      vi.stubGlobal('fetch', fetchMock);
      await expect(t.client.prepare(t.request, signal())).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );
  it.each([
    [400, 'INVALID', 'initialization/invalid'],
    [409, 'CONFLICT', 'initialization/conflict'],
    [410, 'EXPIRED', 'initialization/expired'],
    [429, 'LIMIT', 'initialization/limit'],
    [503, 'PROFILE_UNAVAILABLE', 'initialization/profile-unavailable'],
    [503, 'ACCOUNT_VERSION_UNAVAILABLE', 'initialization/profile-unavailable'],
    [503, 'RPC_UNAVAILABLE', 'initialization/unavailable'],
  ])(
    'maps status %s and %s without inventing an account result',
    async (status, error_code, code) => {
      const t = fixture();
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(Response.json({ error_code }, { status: status as number })),
      );
      await expect(t.client.prepare(t.request, signal())).rejects.toMatchObject({ code });
    },
  );
  it('rejects extra or noncanonical proof fields before sending', async () => {
    const t = fixture();
    expect(() => parseInitializationProof({ ...t.proof, extra: true })).toThrow();
    expect(() =>
      parseInitializationProof({ ...t.proof, signature: `${t.proof.signature}=` }),
    ).toThrow();
    const fetchMock = vi.fn().mockResolvedValue(Response.json(t.value));
    vi.stubGlobal('fetch', fetchMock);
    const consent = await t.client.prepare(t.request, signal());
    fetchMock.mockClear();
    await expect(
      t.client.authorize(consent, { ...t.proof, scope: 'other' }, signal()),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects a prepared or mismatched authorization response', async () => {
    const t = fixture(),
      fetchMock = vi
        .fn()
        .mockResolvedValueOnce(Response.json(t.value))
        .mockResolvedValueOnce(Response.json(t.receipt))
        .mockResolvedValueOnce(
          Response.json({ ...t.receipt, state: 'authorized', approval_digest: fixtureHash('b') }),
        );
    vi.stubGlobal('fetch', fetchMock);
    const consent = await t.client.prepare(t.request, signal());
    await expect(t.client.authorize(consent, t.proof, signal())).rejects.toThrow();
    await expect(t.client.authorize(consent, t.proof, signal())).rejects.toThrow();
  });
  it('verifies the typed signature locally before submission, not just its wire shape', async () => {
    const t = fixture(),
      fetchMock = vi.fn().mockResolvedValue(Response.json(t.value));
    vi.stubGlobal('fetch', fetchMock);
    const consent = await t.client.prepare(t.request, signal());
    fetchMock.mockClear();
    const other = fixture();
    await expect(t.client.authorize(consent, other.proof, signal())).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('aborts before acquiring credentials and preserves exact consent across a mutable caller request', async () => {
    const t = fixture(),
      fetchMock = vi.fn().mockResolvedValue(Response.json(t.value));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    controller.abort();
    await expect(t.client.prepare(t.request, controller.signal)).rejects.toThrow();
    expect(t.token).not.toHaveBeenCalled();
    const original = { ...t.request },
      pending = t.client.prepare(t.request, signal());
    t.request.credential_ref = createResourceId('operation');
    const result = await pending;
    expect(result.expected.credentialRef).toBe(original.credential_ref);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).credential_ref).toBe(
      original.credential_ref,
    );
  });
});

describe('bounded read-only initialization resources', () => {
  function readFixture() {
    const t = fixture(),
      item = {
        initialization_id: t.request.request_id,
        credential_ref: t.request.credential_ref,
        profile_sha256: t.f.pin.digest,
        approval_digest: t.receipt.approval_digest,
        created_at: t.value.valid_after,
        expires_at: t.value.valid_until,
        state: 'prepared' as const,
        creation_operation_recorded: false,
      };
    const history = { observed_at: t.value.valid_after, data: [item], next_cursor: null };
    const restoration = {
      preparation: t.value,
      user_salt_commitment: t.request.user_salt_commitment,
      creation_operation_recorded: false,
    };
    return { ...t, item, history, restoration };
  }
  it('uses authenticated no-store GET with identity release context, never account mutations', async () => {
    const t = readFixture(),
      mock = vi
        .fn()
        .mockResolvedValueOnce(Response.json(t.history))
        .mockResolvedValueOnce(Response.json(t.restoration));
    vi.stubGlobal('fetch', mock);
    const history = await t.client.history(null, signal());
    expect((await t.client.restore(history.data[0], signal())).consent.preparation).toEqual(
      t.value,
    );
    for (const call of mock.mock.calls) {
      expect(call[1]).toMatchObject({
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        headers: {
          [CLIENT_RELEASE_HEADERS.generation]: 'none',
          [CLIENT_RELEASE_HEADERS.manifest]: 'none',
        },
      });
      expect(call[1]).not.toHaveProperty('body');
      expect(call[1].headers).not.toHaveProperty('Content-Type');
    }
  });
  it('validates cursors before I/O and rejects a page that goes backwards', async () => {
    const t = readFixture(),
      mock = vi.fn().mockResolvedValue(Response.json(t.history));
    vi.stubGlobal('fetch', mock);
    await expect(t.client.history('https://other.test', signal())).rejects.toThrow();
    expect(mock).not.toHaveBeenCalled();
    const cursor = `v1:${t.item.created_at}:${t.item.initialization_id}`;
    await expect(t.client.history(cursor, signal())).rejects.toThrow();
    expect(mock.mock.calls[0][0]).toContain(`?after=${encodeURIComponent(cursor)}`);
  });
  it.each(['signature', 'oversized', 'duplicate', 'state', 'future', 'cursor'])(
    'rejects malformed history: %s',
    (change) => {
      const t = readFixture(),
        value: Record<string, unknown> = { ...t.history };
      if (change === 'signature') value.data = [{ ...t.item, assertion: 'not-public' }];
      if (change === 'oversized') value.data = Array.from({ length: 11 }, () => t.item);
      if (change === 'duplicate') value.data = [t.item, t.item];
      if (change === 'state') value.data = [{ ...t.item, state: { toString: () => 'prepared' } }];
      if (change === 'future') value.observed_at = t.item.created_at - 1;
      if (change === 'cursor')
        value.next_cursor = `v1:${t.item.created_at}:${t.item.initialization_id}`;
      expect(() => parseInitializationHistory(value)).toThrow();
    },
  );
  it.each(['salt', 'operation', 'signature', 'profile'])(
    'rejects altered restoration: %s',
    async (change) => {
      const t = readFixture(),
        value: Record<string, unknown> = { ...t.restoration };
      if (change === 'salt') value.user_salt_commitment = fixtureHash('a');
      if (change === 'operation') value.creation_operation_recorded = true;
      if (change === 'signature') value.assertion = t.proof;
      if (change === 'profile')
        value.preparation = { ...t.value, profile_sha256: fixtureHash('b') };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(value)));
      await expect(t.client.restore(t.item, signal())).rejects.toMatchObject({
        code: 'initialization/invalid',
      });
    },
  );
  it('does not trust a selected historical profile as the release pin', async () => {
    const t = readFixture();
    vi.stubGlobal('fetch', vi.fn());
    await expect(
      t.client.restore({ ...t.item, profile_sha256: fixtureHash('b') }, signal()),
    ).rejects.toMatchObject({ code: 'initialization/profile-unavailable' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
