import { Base64 } from 'ox';
import type { Address } from 'viem';
import { isPrfUnavailable } from '@gatopago/shared/passkey';
import type { ClientSettings } from '../lib/settings';
import { api, ApiError } from './api';
import type { Session } from './session';

/**
 * The member's private vault ("one passkey, many keys"): data only they can read, on any device
 * with their passkey. A random data key encrypts it. Each passkey that opens the vault keeps that
 * key wrapped in a Mera secret vault, with its own PRF salt, apart from the account's, so Wallet
 * Core stores ciphertext only. Each space (the team, …) has its own key, derived from the data key
 * with HKDF, and its ciphertext is bound to the account and the space. The data key lives in
 * memory for the session and never touches the disk.
 */

interface Stored {
  keys: { credential_id: string; vault: unknown }[];
  records: { space: string; nonce: string; ciphertext: string; version: number }[];
}

/**
 * `new`: there is no vault yet, opening creates it. `locked`: this passkey opens it. `elsewhere`:
 * it exists, but this passkey is not one of the keys that open it. `open`: open in this session.
 */
export type VaultState = 'new' | 'locked' | 'elsewhere' | 'open';

let open: { token: string; dataKey: Uint8Array; versions: Map<string, number> } | null = null;

const mera = () => import('@category-labs/mera');
const utf8 = (text: string) => new TextEncoder().encode(text);
const read = (settings: ClientSettings, session: Session) =>
  api<Stored>(settings.apiOrigin, 'vault', { token: session.token });
const opened = (session: Session) => (open?.token === session.token ? open : null);

/** What opening the vault on this device would do, without asking for the passkey. */
export async function vaultState(settings: ClientSettings, session: Session): Promise<VaultState> {
  if (opened(session)) return 'open';
  const { keys } = await read(settings, session);
  if (keys.length === 0) return 'new';
  return keys.some(({ credential_id }) => credential_id === session.wallet.credentialId)
    ? 'locked'
    : 'elsewhere';
}

/**
 * Opens the vault with this session's passkey (one prompt), creating it the first time. Throws
 * `VAULT_UNAVAILABLE` when the passkey gives no PRF output, and `VAULT_ELSEWHERE` when this passkey
 * is not one of its keys.
 */
export async function openVault(settings: ClientSettings, session: Session): Promise<void> {
  if (opened(session)) return;
  const { createSecretVaultWithExistingPasskey, decryptSecretVaultWithPasskey, parseSecretVault } =
    await mera();
  const { keys } = await read(settings, session);
  const own = keys.find(({ credential_id }) => credential_id === session.wallet.credentialId);
  if (keys.length > 0 && !own) throw new Error('VAULT_ELSEWHERE');
  const rpId = settings.passkeyRpId;
  try {
    let dataKey: Uint8Array;
    if (own)
      dataKey = await decryptSecretVaultWithPasskey({ rpId, vault: parseSecretVault(own.vault) });
    else {
      dataKey = crypto.getRandomValues(new Uint8Array(32));
      const vault = await createSecretVaultWithExistingPasskey({
        rpId,
        credential: { credentialId: session.wallet.credentialId },
        secret: dataKey,
      });
      await api(settings.apiOrigin, 'vault/keys', {
        method: 'PUT',
        token: session.token,
        body: { credential_id: vault.credential.credentialId, vault, create: true },
      }).catch((error: unknown) => {
        // Another device started it first: its data key is the one, opened from there.
        if (error instanceof ApiError && error.code === 'VAULT_EXISTS')
          throw new Error('VAULT_ELSEWHERE');
        throw error;
      });
    }
    // Replaces the vault of an earlier session only once this one opened.
    closeVault();
    open = { token: session.token, dataKey, versions: new Map() };
  } catch (error) {
    if (isPrfUnavailable(error)) throw new Error('VAULT_UNAVAILABLE', { cause: error });
    throw error;
  }
}

/** The vault's key for one space, bound to the account through the ciphertext's associated data. */
async function spaceKey(dataKey: Uint8Array, space: string) {
  const base = await crypto.subtle.importKey(
    'raw',
    dataKey as Uint8Array<ArrayBuffer>,
    'HKDF',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: utf8(`gatopago.vault.v1/${space}`),
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

const associated = (account: Address, space: string) => utf8(`${account.toLowerCase()}:${space}`);
const encode = (bytes: Uint8Array) => Base64.fromBytes(bytes, { url: true, pad: false });

/** The decrypted record of `space`, or null when there is none. The vault must be open. */
export async function readVaultRecord<T>(
  settings: ClientSettings,
  session: Session,
  space: string,
): Promise<T | null> {
  const vault = opened(session);
  if (!vault) throw new Error('VAULT_LOCKED');
  const record = (await read(settings, session)).records.find((row) => row.space === space);
  vault.versions.set(space, record?.version ?? 0);
  if (!record) return null;
  const plaintext = await crypto.subtle
    .decrypt(
      {
        name: 'AES-GCM',
        iv: Base64.toBytes(record.nonce) as Uint8Array<ArrayBuffer>,
        additionalData: associated(session.wallet.address, space),
      },
      await spaceKey(vault.dataKey, space),
      Base64.toBytes(record.ciphertext) as Uint8Array<ArrayBuffer>,
    )
    .catch(() => {
      throw new Error('VAULT_UNREADABLE');
    });
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

/**
 * Encrypts `value` and saves it as the record of `space`. Saved over the version last read; if
 * another device saved since, it reads that version and saves again, so the last save wins
 * knowingly. The vault must be open.
 */
export async function writeVaultRecord(
  settings: ClientSettings,
  session: Session,
  space: string,
  value: unknown,
): Promise<void> {
  const vault = opened(session);
  if (!vault) throw new Error('VAULT_LOCKED');
  const key = await spaceKey(vault.dataKey, space);
  for (let attempt = 0; ; attempt++) {
    if (!vault.versions.has(space)) await readVaultRecord(settings, session, space);
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: associated(session.wallet.address, space) },
      key,
      utf8(JSON.stringify(value)),
    );
    try {
      const { version } = await api<{ version: number }>(settings.apiOrigin, 'vault/records', {
        method: 'PUT',
        token: session.token,
        body: {
          space,
          nonce: encode(nonce),
          ciphertext: encode(new Uint8Array(ciphertext)),
          version: vault.versions.get(space),
        },
      });
      vault.versions.set(space, version);
      return;
    } catch (error) {
      if (attempt > 0 || !(error instanceof ApiError) || error.code !== 'VAULT_CHANGED')
        throw error;
      vault.versions.delete(space);
    }
  }
}

/** Lets another passkey of the account open the vault (one prompt with that passkey). */
export async function addVaultPasskey(
  settings: ClientSettings,
  session: Session,
  credentialId: string,
): Promise<void> {
  const vault = opened(session);
  if (!vault) throw new Error('VAULT_LOCKED');
  const { createSecretVaultWithExistingPasskey } = await mera();
  const wrapped = await createSecretVaultWithExistingPasskey({
    rpId: settings.passkeyRpId,
    credential: { credentialId },
    secret: vault.dataKey,
  }).catch((error: unknown) => {
    if (isPrfUnavailable(error)) throw new Error('VAULT_UNAVAILABLE', { cause: error });
    throw error;
  });
  await api(settings.apiOrigin, 'vault/keys', {
    method: 'PUT',
    token: session.token,
    body: { credential_id: wrapped.credential.credentialId, vault: wrapped },
  });
}

/** Forgets the open vault: on sign-out, or to show the cross-device test. */
export function closeVault() {
  open?.dataKey.fill(0);
  open = null;
}
