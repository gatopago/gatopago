import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientSettings } from '../src/lib/settings';
import type { Session } from '../src/wallet/session';

// Mera's secret vaults and Wallet Core are simulated; the vault's own encryption is real WebCrypto.
const fake = vi.hoisted(() => ({
  server: { keys: [] as { credential_id: string; vault: unknown }[], records: [] as never[] },
  prf: true,
  prompts: 0,
}));
vi.mock('@category-labs/mera', () => {
  const prfUnavailable = () => Object.assign(new Error('no PRF'), { code: 'PRF_UNAVAILABLE' });
  return {
    parseSecretVault: (vault: unknown) => vault,
    // A stand-in for a passkey-wrapped secret: only the matching credential "opens" it.
    createSecretVaultWithExistingPasskey: async ({
      credential,
      secret,
    }: {
      credential: { credentialId: string };
      secret: Uint8Array;
    }) => {
      fake.prompts++;
      if (!fake.prf) throw prfUnavailable();
      return { version: 1, credential, wrapped: Array.from(secret) };
    },
    decryptSecretVaultWithPasskey: async ({ vault }: { vault: { wrapped: number[] } }) => {
      fake.prompts++;
      if (!fake.prf) throw prfUnavailable();
      return Uint8Array.from(vault.wrapped);
    },
  };
});
vi.mock('../src/wallet/api', async (original) => {
  const { ApiError } = await original<typeof import('../src/wallet/api')>();
  type Body = Record<string, unknown>;
  return {
    ApiError,
    api: async (_origin: string, path: string, init: { body?: Body } = {}) => {
      const { server } = fake;
      if (path === 'vault') return structuredClone(server);
      const body = init.body!;
      if (path === 'vault/keys') {
        if (body.create && server.keys.length > 0) throw new ApiError(409, 'VAULT_EXISTS');
        server.keys.push({ credential_id: body.credential_id as string, vault: body.vault });
        return {};
      }
      const records = server.records as { space: string; version: number }[];
      const current = records.find((record) => record.space === body.space);
      if ((current?.version ?? 0) !== body.version) throw new ApiError(409, 'VAULT_CHANGED');
      const { space, nonce, ciphertext } = body as Record<string, string>;
      const saved = { space, nonce, ciphertext, version: (body.version as number) + 1 };
      if (current) Object.assign(current, saved);
      else records.push(saved);
      return { version: saved.version };
    },
  };
});

const settings = {
  apiOrigin: 'https://api.gatopago.com',
  passkeyRpId: 'gatopago.com',
} as ClientSettings;
const session = (credentialId: string, token = `session-${credentialId}`) =>
  ({
    token,
    wallet: { address: '0x2222222222222222222222222222222222222222', credentialId },
  }) as unknown as Session;
const team = [{ who: '0x3333333333333333333333333333333333333333', amount: '300' }];

beforeEach(() => {
  vi.resetModules();
  fake.server = { keys: [], records: [] };
  fake.prf = true;
  fake.prompts = 0;
});

describe('private vault', () => {
  it('stores ciphertext only, and the same passkey reopens it on another device', async () => {
    const phone = session('phone');
    const vault = await import('../src/wallet/vault');
    expect(await vault.vaultState(settings, phone)).toBe('new');
    await vault.openVault(settings, phone);
    await vault.writeVaultRecord(settings, phone, 'team', team);
    expect(JSON.stringify(fake.server.records)).not.toContain('3333');
    expect(JSON.stringify(fake.server.records)).not.toContain('300');

    // Another device: nothing in memory, the same passkey, one prompt.
    vi.resetModules();
    const laptop = await import('../src/wallet/vault');
    const again = session('phone', 'session-laptop');
    expect(await laptop.vaultState(settings, again)).toBe('locked');
    await laptop.openVault(settings, again);
    expect(await laptop.readVaultRecord(settings, again, 'team')).toEqual(team);
    expect(fake.prompts).toBe(2);
  });

  it('opens only with its passkeys, and another one is added from an open vault', async () => {
    const phone = session('phone');
    const backup = session('backup');
    const vault = await import('../src/wallet/vault');
    await vault.openVault(settings, phone);
    await vault.writeVaultRecord(settings, phone, 'team', team);
    expect(await vault.vaultState(settings, backup)).toBe('elsewhere');
    await expect(vault.openVault(settings, backup)).rejects.toThrow('VAULT_ELSEWHERE');

    await vault.addVaultPasskey(settings, phone, 'backup');
    vault.closeVault();
    await vault.openVault(settings, backup);
    expect(await vault.readVaultRecord(settings, backup, 'team')).toEqual(team);
  });

  it('binds each record to its space: one moved to another space does not decrypt', async () => {
    const phone = session('phone');
    const vault = await import('../src/wallet/vault');
    await vault.openVault(settings, phone);
    await vault.writeVaultRecord(settings, phone, 'team', team);
    const [record] = fake.server.records as { space: string }[];
    record.space = 'notes';
    await expect(vault.readVaultRecord(settings, phone, 'notes')).rejects.toThrow(
      'VAULT_UNREADABLE',
    );
  });

  it('saves again over a newer version written by another device', async () => {
    const phone = session('phone');
    const vault = await import('../src/wallet/vault');
    await vault.openVault(settings, phone);
    await vault.writeVaultRecord(settings, phone, 'team', team);
    (fake.server.records as { version: number }[])[0].version = 5;
    await vault.writeVaultRecord(settings, phone, 'team', []);
    expect(await vault.readVaultRecord(settings, phone, 'team')).toEqual([]);
  });

  it('reports a passkey without PRF instead of saving anything', async () => {
    fake.prf = false;
    const vault = await import('../src/wallet/vault');
    await expect(vault.openVault(settings, session('phone'))).rejects.toThrow('VAULT_UNAVAILABLE');
    expect(fake.server.keys).toEqual([]);
  });
});
