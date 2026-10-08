import { WebAuthnP256 } from 'ox';
import { bytesToHex, hexToBytes, type Address, type Hex } from 'viem';
import { createWebAuthnCredential } from 'viem/account-abstraction';
import { walletContracts } from '@gatopago/shared/networks';
import {
  capturingWebAuthnClient,
  isPrfUnavailable,
  passkeyAccount,
  type PasskeyAssertion,
} from '@gatopago/shared/passkey';
import { gatopagoAccountFactoryAbi, keyOwner, passkeyOwner } from '@gatopago/shared/wallet';
import type { ClientSettings } from '../lib/settings';
import { api, ApiError, type Approvals } from './api';
import { publicClient } from './account';
import type { Wallet } from './session';

const random = (size: number) => crypto.getRandomValues(new Uint8Array(size));

/**
 * Creates a passkey for GatoPago. A backup passkey stores its account address as the WebAuthn
 * user handle, so a device that has never seen it can find the account.
 */
export async function createPasskey(
  settings: ClientSettings,
  name: string,
  account?: Address,
  /** `cross-platform` asks for a physical security key (USB, NFC, Bluetooth). */
  attachment?: AuthenticatorAttachment,
) {
  const credential = await createWebAuthnCredential({
    rp: { id: settings.passkeyRpId, name: 'GatoPago' },
    user: { id: account ? hexToBytes(account) : random(16), name },
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'required',
      authenticatorAttachment: attachment,
    },
  });
  return { credentialId: credential.id, publicKey: credential.publicKey };
}

/** A new account: its address derives from the passkey through the factory. */
export async function newWallet(settings: ClientSettings, name: string): Promise<Wallet> {
  const { credentialId, publicKey } = await createPasskey(settings, name);
  return passkeyWallet(settings, credentialId, publicKey);
}

async function passkeyWallet(
  settings: ClientSettings,
  credentialId: string,
  publicKey: Hex,
): Promise<Wallet> {
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
  const assertion = await WebAuthnP256.sign({
    challenge: bytesToHex(random(32)),
    rpId: settings.passkeyRpId,
  });
  const wallet = await assertedWallet(settings, assertion);
  if (!wallet) throw new ApiError(404, 'ACCOUNT_NOT_FOUND');
  return wallet;
}

/** The account a passkey assertion belongs to, as one of its passkey owners, or null. */
const assertedWallet = (settings: ClientSettings, assertion: PasskeyAssertion) =>
  passkeyAccount(assertion, {
    accountOf: (owners) => accountOf(settings, owners),
    approvals: (address) => approvals(settings, address),
  });

/** The account a Mera key owns: the same address on any device that has the passkey. */
async function meraWallet(
  settings: ClientSettings,
  credentialId: string,
  owner: Address,
): Promise<Wallet> {
  const initialOwners = [keyOwner(owner)];
  return {
    credentialId,
    publicKey: '0x',
    meraOwner: owner,
    initialOwners,
    address: await accountOf(settings, initialOwners),
  };
}

/** A passkey created for sign-up whose ceremony did not finish: a retry reuses it. */
let unfinished: { id: string; publicKey: Hex } | null = null;

/**
 * Creates the passkey of a new account and the wallet that owns it. With Mera on and PRF
 * available, the key Mera derives owns the account (no prompts while its session lasts);
 * otherwise the passkey itself does: the same passkey, so a device without PRF never leaves an
 * extra one behind. A cancelled prompt creates nothing.
 */
export async function newAccountWallet(settings: ClientSettings, name: string): Promise<Wallet> {
  if (!settings.mera) return newWallet(settings, name);
  const [{ createPasskeyWithPrfOutput, getPasskeyPrfOutput }, { openMeraSession }] =
    await Promise.all([import('@category-labs/mera'), import('./mera')]);
  const { client, seen } = capturingWebAuthnClient();
  const rp = { id: settings.passkeyRpId, name: 'GatoPago' };
  try {
    const created = unfinished
      ? await getPasskeyPrfOutput({
          rpId: rp.id,
          credential: { credentialId: unfinished.id },
          webAuthnClient: client,
        })
      : await createPasskeyWithPrfOutput({
          rp,
          user: { name, displayName: name },
          webAuthnClient: client,
        });
    unfinished = null;
    const { address } = await openMeraSession(settings, created.credentialId, created.prfOutput);
    return meraWallet(settings, created.credentialId, address);
  } catch (error) {
    const passkey = unfinished ?? seen.created;
    if (!passkey) throw error;
    if (!isPrfUnavailable(error)) {
      unfinished = passkey;
      throw error;
    }
    unfinished = null;
    return passkeyWallet(settings, passkey.id, passkey.publicKey);
  }
}

/**
 * Finds the account of whichever passkey the person picks, with one prompt: with Mera on, the
 * same assertion derives Mera's key (when the device returns PRF) and carries the signature the
 * passkey's own key is recovered from, so either kind of account is found. An account is never
 * computed from the other kind's key: with no PRF, a Mera account is reported, not replaced.
 */
export async function findAnyWallet(settings: ClientSettings): Promise<Wallet> {
  if (!settings.mera) return findWallet(settings);
  const [{ getPasskeyPrfOutput }, { endMeraSession, openMeraSession }] = await Promise.all([
    import('@category-labs/mera'),
    import('./mera'),
  ]);
  const { client, seen } = capturingWebAuthnClient();
  let mera: Wallet | null = null;
  try {
    const { credentialId, prfOutput } = await getPasskeyPrfOutput({
      rpId: settings.passkeyRpId,
      webAuthnClient: client,
    });
    const { address } = await openMeraSession(settings, credentialId, prfOutput);
    mera = await meraWallet(settings, credentialId, address);
    if (await approvals(settings, mera.address)) return mera;
    endMeraSession();
  } catch (error) {
    if (!seen.asserted || !isPrfUnavailable(error)) throw error;
  }
  const wallet = await assertedWallet(settings, seen.asserted!);
  if (wallet) return wallet;
  throw new ApiError(404, mera ? 'ACCOUNT_NOT_FOUND' : 'PASSKEY_WITHOUT_PRF');
}

async function accountOf(settings: ClientSettings, owners: readonly Hex[]): Promise<Address> {
  return publicClient(settings, settings.homeNetwork).readContract({
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
