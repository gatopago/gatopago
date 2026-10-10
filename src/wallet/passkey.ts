import { encodeFunctionData, hexToBytes, type Address, type Hex } from 'viem';
import { walletContracts } from '@gatopago/shared/networks';
import {
  capturingWebAuthnClient,
  findAccount,
  isPrfUnavailable,
  PASSKEY_PROMPT_MS,
} from '@gatopago/shared/passkey';
import { gatopagoAccountAbi, gatopagoAccountFactoryAbi, keyOwner } from '@gatopago/shared/wallet';
import type { ClientSettings } from '../lib/settings';
import { api, ApiError, type Approvals } from './api';
import { publicClient } from './account';
import type { MeraKeys } from './mera';
import type { Wallet } from './session';

/**
 * Every account is Mera's: each of its passkeys gives a PRF output from which Mera derives the key
 * that owns the account (and its Stellar key). A passkey without PRF cannot be one of them.
 */

const unavailable = (error: unknown) =>
  isPrfUnavailable(error) ? new ApiError(400, 'PASSKEY_WITHOUT_PRF') : error;

/** A passkey created for sign-up whose ceremony did not finish: a retry reuses it. */
let unfinished: string | null = null;

/**
 * Creates the first passkey of a new account and the wallet its Mera key owns (the account's only
 * initial owner). A device or password manager without PRF cannot create one: `PASSKEY_WITHOUT_PRF`,
 * never another kind of account. A cancelled prompt creates nothing.
 */
export async function newAccountWallet(settings: ClientSettings, name: string): Promise<Wallet> {
  const [{ createPasskeyWithPrfOutput, getPasskeyPrfOutput }, { openMeraSession }] =
    await Promise.all([import('@category-labs/mera'), import('./mera')]);
  const { client, seen } = capturingWebAuthnClient();
  const rp = { id: settings.passkeyRpId, name: 'GatoPago' };
  try {
    const created = unfinished
      ? await getPasskeyPrfOutput({
          rpId: rp.id,
          credential: { credentialId: unfinished },
          webAuthnClient: client,
          timeout: PASSKEY_PROMPT_MS,
        })
      : await createPasskeyWithPrfOutput({
          rp,
          user: { name, displayName: name },
          webAuthnClient: client,
          timeout: PASSKEY_PROMPT_MS,
        });
    unfinished = null;
    const { address: owner } = await openMeraSession(
      settings,
      created.credentialId,
      created.prfOutput,
    );
    const initialOwners = [keyOwner(owner)];
    return {
      credentialId: created.credentialId,
      owner,
      initialOwners,
      address: await accountOf(settings, initialOwners),
    };
  } catch (error) {
    // Created, but its PRF prompt was cancelled: the next attempt asks that passkey again.
    unfinished = isPrfUnavailable(error) ? null : (seen.created?.id ?? unfinished);
    throw unavailable(error);
  }
}

/**
 * Asks for any GatoPago passkey and finds the account its Mera key owns, with one prompt
 * (`findAccount`).
 */
export async function findAnyWallet(settings: ClientSettings): Promise<Wallet> {
  const [{ getPasskeyPrfOutput }, { endMeraSession, openMeraSession }] = await Promise.all([
    import('@category-labs/mera'),
    import('./mera'),
  ]);
  const { client, seen } = capturingWebAuthnClient();
  const { credentialId, prfOutput } = await getPasskeyPrfOutput({
    rpId: settings.passkeyRpId,
    webAuthnClient: client,
    timeout: PASSKEY_PROMPT_MS,
  }).catch((error: unknown) => {
    throw unavailable(error);
  });
  const { address: owner } = await openMeraSession(settings, credentialId, prfOutput);
  const found = await findAccount(publicClient(settings, settings.homeNetwork), {
    contracts: walletContracts,
    assertion: seen.asserted!,
    owner,
    lookup: {
      accountOf: (owners) => accountOf(settings, owners),
      approvals: (address) => approvals(settings, address),
    },
  });
  if (!found) {
    endMeraSession();
    throw new ApiError(404, 'ACCOUNT_NOT_FOUND');
  }
  return { credentialId, owner, address: found.address, initialOwners: found.initialOwners };
}

/**
 * A new backup passkey for `account`: its user handle is the account's address, so any device
 * finds the account through it, and its Mera key (`owner`) becomes an owner once approved. `run`
 * runs with its keys while they are in memory (to approve its Stellar key), then they are wiped.
 * `attachment` asks for a physical security key.
 */
export async function newBackupKey<T>(
  settings: ClientSettings,
  account: Address,
  run: (keys: MeraKeys) => Promise<T>,
  attachment?: AuthenticatorAttachment,
): Promise<{ owner: Address; result: T }> {
  const [{ createPasskeyWithPrfOutput }, { withMeraKeys }] = await Promise.all([
    import('@category-labs/mera'),
    import('./mera'),
  ]);
  const { client } = capturingWebAuthnClient({ userHandle: hexToBytes(account), attachment });
  const created = await createPasskeyWithPrfOutput({
    rp: { id: settings.passkeyRpId, name: 'GatoPago' },
    user: { name: 'GatoPago backup', displayName: 'GatoPago backup' },
    webAuthnClient: client,
    timeout: PASSKEY_PROMPT_MS,
  }).catch((error: unknown) => {
    throw unavailable(error);
  });
  let owner: Address | null = null;
  const result = await withMeraKeys(settings, created.prfOutput, async (keys) => {
    owner = keys.account.address;
    return run(keys);
  });
  return { owner: owner!, result };
}

/** The call that makes `owner` (a Mera key) an owner of the account. */
export const addOwnerCall = (owner: Address): Hex =>
  encodeFunctionData({
    abi: gatopagoAccountAbi,
    functionName: 'addOwners',
    args: [[keyOwner(owner)]],
  });

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
