import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createResourceId } from '@gatopago/shared/v3/primitives';
import { parseEnvironment } from '@gatopago/environment';
import environments from '@gatopago/environment/environments.json';
import { buildAuthConfig, type EnabledAuthConfig } from '../src/auth/config';
import {
  normalizeUsername,
  parseRecipient,
  profileClient,
  resolveUsername,
  finishRegisteredAccount,
} from '../src/wallet/profile';

const config = buildAuthConfig(
  {
    ...parseEnvironment(environments.production),
    status: 'provisioned',
    firebase_project_id: 'v3-runtime-test',
  },
  {
    apiKey: `AIza${'A'.repeat(35)}`,
    appId: '1:123456789:web:012345abcdef',
    turnstileSiteKey: `0x${'A'.repeat(22)}`,
  },
) as EnabledAuthConfig;
const uid = createResourceId('user'),
  wallet = createResourceId('wallet'),
  account = createResourceId('walletAccount');
const now = 1790529000,
  signal = () => new AbortController().signal;
const token = vi.fn(async () => 'synthetic.id.token');
const profile = () => ({
  user_id: uid,
  display_name: 'Daniel',
  username: 'daniel',
  username_reserved_until: now + 100,
  username_published_at: null,
  receiving_wallet_id: null,
});
const recipient = () => ({
  username: 'daniel',
  display_name: 'Daniel',
  network_id: 'eip155:421614',
  address: `0x${'12'.repeat(20)}`,
  verified_at: now,
  expires_at: now + 30,
});
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(now * 1000);
  vi.stubGlobal('fetch', vi.fn());
  token.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Private profile and public username clients', () => {
  it('finishes signup with the reserved username and exact deployed account, without another form', async () => {
    const published = {
      ...profile(),
      username_reserved_until: null,
      username_published_at: now,
      receiving_wallet_id: wallet,
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json(profile()))
      .mockResolvedValueOnce(Response.json(published));
    const client = { ...profileClient(config, token, uid), assertCurrent: vi.fn() };
    expect(await finishRegisteredAccount(client, wallet, account, signal())).toEqual(published);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenLastCalledWith(
      `${config.apiOrigin}/app/v1/profile/username`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'daniel', wallet_id: wallet, wallet_account_id: account }),
      }),
    );
  });
  it('reads an already-published result without publishing again after a lost response', async () => {
    const published = {
      ...profile(),
      username_reserved_until: null,
      username_published_at: now,
      receiving_wallet_id: wallet,
    };
    vi.mocked(fetch).mockImplementation(async () => Response.json(published));
    const client = { ...profileClient(config, token, uid), assertCurrent: vi.fn() };
    await finishRegisteredAccount(client, wallet, account, signal());
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      `${config.apiOrigin}/app/v1/profile`,
      expect.objectContaining({ method: 'GET' }),
    );
    await expect(
      finishRegisteredAccount(client, createResourceId('wallet'), account, signal()),
    ).rejects.toMatchObject({ code: 'profile/immutable' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('does not enable receiving if publication verification fails', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json(profile()))
      .mockResolvedValueOnce(
        Response.json({ error_code: 'RECEIVING_UNAVAILABLE' }, { status: 503 }),
      );
    const client = { ...profileClient(config, token, uid), assertCurrent: vi.fn() };
    await expect(finishRegisteredAccount(client, wallet, account, signal())).rejects.toMatchObject({
      code: 'profile/receiving-unavailable',
    });
  });
  it('does not publish after cancellation or a session change during the profile read', async () => {
    const abort = new AbortController();
    const client = {
      read: vi.fn(async () => {
        abort.abort();
        return profile();
      }),
      publish: vi.fn(),
      rename: vi.fn(),
      assertCurrent: vi.fn(),
    };
    await expect(finishRegisteredAccount(client, wallet, account, abort.signal)).rejects.toThrow();
    expect(client.publish).not.toHaveBeenCalled();
  });
  it.each(['ana', 'leo', 'dani', 'a'.repeat(30)])(
    'accepts and resolves the supported username %s',
    async (username) => {
      expect(normalizeUsername(`@${username.toUpperCase()}`)).toBe(username);
      const value = { ...recipient(), username };
      vi.mocked(fetch).mockResolvedValue(Response.json(value));
      expect(await resolveUsername(config.deployment, username, 'eip155:421614', signal())).toEqual(
        value,
      );
      expect(parseRecipient(value, username, 'eip155:421614', now)).toEqual(value);
    },
  );
  it('reads only the expected user and saves a display name without Firebase profile fields', async () => {
    vi.mocked(fetch).mockImplementation(async () => Response.json(profile()));
    const client = profileClient(config, token, uid);
    expect(await client.read(signal())).toEqual(profile());
    await client.rename('Daniel', signal());
    expect(fetch).toHaveBeenLastCalledWith(
      `${config.apiOrigin}/app/v1/profile`,
      expect.objectContaining({ method: 'POST', body: '{"display_name":"Daniel"}' }),
    );
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ ...profile(), user_id: createResourceId('user') }),
    );
    await expect(client.read(signal())).rejects.toThrow();
  });
  it('publishes a selected wallet/account pair with a canonical username', async () => {
    const published = {
      ...profile(),
      username_reserved_until: null,
      username_published_at: now,
      receiving_wallet_id: wallet,
    };
    vi.mocked(fetch).mockResolvedValue(Response.json(published));
    expect(
      await profileClient(config, token, uid).publish('@Daniel', wallet, account, signal()),
    ).toEqual(published);
    expect(fetch).toHaveBeenCalledWith(
      `${config.apiOrigin}/app/v1/profile/username`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'daniel', wallet_id: wallet, wallet_account_id: account }),
      }),
    );
  });
  it('rejects a published profile without a receiving wallet and extra private data', async () => {
    for (const value of [
      { ...profile(), username_published_at: now },
      { ...profile(), firebase_subject: 'private' },
    ]) {
      vi.mocked(fetch).mockResolvedValue(Response.json(value));
      await expect(profileClient(config, token, uid).read(signal())).rejects.toThrow();
    }
  });
  it('surfaces conflicts without automatically retrying a publication', async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ error_code: 'USERNAME_UNAVAILABLE' }, { status: 409 }),
    );
    await expect(
      profileClient(config, token, uid).publish('daniel', wallet, account, signal()),
    ).rejects.toMatchObject({ code: 'profile/username-unavailable' });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('uses a bounded public lookup without a token or a server-selected URL', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json(recipient()));
    expect(await resolveUsername(config.deployment, '@DANIEL', 'eip155:421614', signal())).toEqual(
      recipient(),
    );
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      `${config.apiOrigin}/app/v1/recipients/daniel?network_id=eip155%3A421614`,
      expect.objectContaining({
        method: 'GET',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        headers: { Accept: 'application/json' },
      }),
    );
    expect(token).not.toHaveBeenCalled();
  });
  it.each(['username', 'network', 'address', 'expiry', 'future', 'long', 'extra'])(
    'rejects mismatched or stale recipient %s',
    (variant) => {
      const value = recipient();
      if (variant === 'username') value.username = 'someone_else';
      if (variant === 'network') value.network_id = 'eip155:1';
      if (variant === 'address') value.address = `0x${'00'.repeat(20)}`;
      if (variant === 'expiry') value.expires_at = now;
      if (variant === 'future') value.verified_at = now + 6;
      if (variant === 'long') value.expires_at = now + 61;
      if (variant === 'extra') Object.assign(value, { destination_url: 'https://evil.test' });
      expect(() => parseRecipient(value, 'daniel', 'eip155:421614', now)).toThrow();
    },
  );
  it.each([
    'a',
    'ab',
    'a'.repeat(31),
    'admin/name',
    'a-bcd',
    '@@daniel',
    '<script>',
    'daniel?network_id=1',
  ])('rejects invalid username %s before requests', async (value) => {
    expect(() => normalizeUsername(value)).toThrow();
    await expect(
      resolveUsername(config.deployment, value, 'eip155:421614', signal()),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not treat an unavailable, rate-limited, oversized or cancelled lookup as a verified recipient', async () => {
    for (const [status, code] of [
      [404, 'profile/not-found'],
      [429, 'profile/rate-limited'],
      [503, 'profile/unavailable'],
    ] as const) {
      vi.mocked(fetch).mockResolvedValue(Response.json({ error_code: 'UNAVAILABLE' }, { status }));
      await expect(
        resolveUsername(config.deployment, 'daniel', 'eip155:421614', signal()),
      ).rejects.toMatchObject({ code });
    }
    vi.mocked(fetch).mockResolvedValue(new Response(' '.repeat(4097)));
    await expect(
      resolveUsername(config.deployment, 'daniel', 'eip155:421614', signal()),
    ).rejects.toThrow();
    vi.mocked(fetch).mockClear();
    const controller = new AbortController();
    controller.abort();
    await expect(
      resolveUsername(config.deployment, 'daniel', 'eip155:421614', controller.signal),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
