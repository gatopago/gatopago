import { P256, PublicKey, WebAuthnP256 } from 'ox';
import {
  bytesToHex,
  concat,
  getAddress,
  hexToBytes,
  sha256,
  stringToHex,
  type Address,
  type Hex,
} from 'viem';
import { createWebAuthnCredential } from 'viem/account-abstraction';
import { walletContracts } from '@gatopago/shared/networks';
import { gatopagoAccountFactoryAbi, ownersAfter, passkeyOwner } from '@gatopago/shared/wallet';
import type { ClientSettings } from '../lib/settings';
import { api, ApiError, type Approvals } from './api';
import { publicClient } from './account';
import type { Wallet } from './session';

const random = (size: number) => crypto.getRandomValues(new Uint8Array(size));

/**
 * Creates a passkey for GatoPago. A backup passkey stores its account address as the WebAuthn
 * user handle, so a device that has never seen it can find the account.
 */
export async function createPasskey(name: string, account?: Address) {
  const credential = await createWebAuthnCredential({
    rp: { id: location.hostname, name: 'GatoPago' },
    user: { id: account ? hexToBytes(account) : random(16), name },
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  });
  return { credentialId: credential.id, publicKey: credential.publicKey };
}

/** A new account: its address derives from the passkey through the factory. */
export async function newWallet(settings: ClientSettings, name: string): Promise<Wallet> {
  const { credentialId, publicKey } = await createPasskey(name);
  const initialOwners = [passkeyOwner(walletContracts.webAuthnVerifier, publicKey)];
  return {
    credentialId,
    publicKey,
    initialOwners,
    address: await accountOf(settings, initialOwners),
  };
}

/**
 * Asks for any GatoPago passkey and finds its account. WebAuthn does not return the public key on
 * sign-in, so it is recovered from the signature (two candidates) and matched against the owners
 * of a GatoPago member's account.
 */
export async function findWallet(settings: ClientSettings): Promise<Wallet> {
  const { id, metadata, signature, raw } = await WebAuthnP256.sign({
    challenge: bytesToHex(random(32)),
    rpId: location.hostname,
  });
  const candidates = recoverPublicKeys(metadata, signature);
  const handle = (raw.response as AuthenticatorAssertionResponse).userHandle;
  const backupOf =
    handle?.byteLength === 20 ? getAddress(bytesToHex(new Uint8Array(handle))) : null;

  for (const publicKey of candidates) {
    const owner = passkeyOwner(walletContracts.webAuthnVerifier, publicKey);
    const address = backupOf ?? (await accountOf(settings, [owner]));
    const account = await approvals(settings, address);
    if (!account) continue;
    // Before its first approval the server only knows the address, which derives from [owner].
    const initialOwners = account.initial_owners ?? (backupOf ? [] : [owner]);
    const owners = ownersAfter(
      initialOwners,
      account.approvals.map((approval) => approval.call),
    );
    if (owners.some((value) => value.toLowerCase() === owner.toLowerCase()))
      return { credentialId: id, publicKey, address, initialOwners };
  }
  throw new ApiError(404, 'ACCOUNT_NOT_FOUND');
}

/** The two P-256 public keys (64-byte hex) a WebAuthn assertion signature can come from. */
export function recoverPublicKeys(
  metadata: { authenticatorData: Hex; clientDataJSON: string },
  signature: { r: bigint; s: bigint },
): Hex[] {
  const payload = sha256(
    concat([metadata.authenticatorData, sha256(stringToHex(metadata.clientDataJSON))]),
  );
  return [0, 1].map((yParity) =>
    PublicKey.toHex(P256.recoverPublicKey({ payload, signature: { ...signature, yParity } }), {
      includePrefix: false,
    }),
  );
}

async function accountOf(settings: ClientSettings, owners: readonly Hex[]): Promise<Address> {
  return publicClient(settings.networks[0]).readContract({
    address: walletContracts.factory,
    abi: gatopagoAccountFactoryAbi,
    functionName: 'getAddress',
    args: [owners, 0n],
  });
}

async function approvals(settings: ClientSettings, address: Address) {
  try {
    return await api<Approvals>(settings.apiOrigin, `approvals/${address}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
