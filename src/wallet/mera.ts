import {
  createEd25519SigningSession,
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getPasskeyPrfOutput,
  type Ed25519SigningSession,
  type Secp256k1SigningSession,
} from '@category-labs/mera';
import { toViemAccount } from '@category-labs/mera/viem';
import { HDKey } from '@scure/bip32';
import { entropyToMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { bytesToHex, isAddressEqual, type Address, type LocalAccount } from 'viem';
import type { StellarKey } from '@gatopago/shared/stellar';
import type { ClientSettings } from '../lib/settings';

/**
 * Mera (Category Labs): a passkey's PRF output derives the keys of a GatoPago account, through the
 * same factory and paymaster: an Ethereum key that owns the EVM account and, when Stellar is on, a
 * Stellar key that signs for its Stellar account. One fingerprint opens a signing session; while
 * it lasts, payments need no prompt. The keys live only in memory and the session ends after
 * `settings.meraSessionMinutes` without use or when the page goes away, so a closed app always
 * asks again. A key copied while in memory keeps working until the account removes it: this is a
 * software key, unlike the passkey itself.
 */

/** BIP-44 path of the first Ethereum account, as Mera's recipes derive it. */
const PATH = "m/44'/60'/0'/0/0";

let current: {
  credentialId: string;
  session: Secp256k1SigningSession;
  account: LocalAccount;
  /** The Stellar key (SEP-5, `m/44'/148'/0'`), when Stellar is on. */
  stellar: Ed25519SigningSession | null;
  idleMs: number;
  timer: ReturnType<typeof setTimeout>;
} | null = null;

/** Ends the signing session: the next signature needs the passkey again. */
export function endMeraSession() {
  if (!current) return;
  clearTimeout(current.timer);
  current.session.end();
  current.stellar?.end();
  current = null;
}

if (typeof window !== 'undefined') window.addEventListener('pagehide', endMeraSession);

/** Starts a session for the keys `prfOutput` derives, zeroing it and the intermediate secrets. */
export async function openMeraSession(
  settings: ClientSettings,
  credentialId: string,
  prfOutput: Uint8Array,
): Promise<LocalAccount> {
  endMeraSession();
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
  prfOutput.fill(0);
  try {
    const node = HDKey.fromMasterSeed(seed).derive(PATH);
    if (!node.privateKey) throw new Error('MERA_DERIVATION_FAILED');
    const session = createSecp256k1SigningSession({ privateKey: node.privateKey });
    node.wipePrivateData();
    let stellar: Ed25519SigningSession | null = null;
    if (settings.stellar) {
      // Loaded only when Stellar is on: the Stellar SDK is large.
      const { stellarKeyFromSeed } = await import('@gatopago/shared/stellar');
      const privateKey = await stellarKeyFromSeed(seed);
      stellar = createEd25519SigningSession({ privateKey });
      privateKey.fill(0);
    }
    const account = toViemAccount(session);
    const idleMs = settings.meraSessionMinutes * 60_000;
    current = {
      credentialId,
      session,
      account,
      stellar,
      idleMs,
      timer: setTimeout(endMeraSession, idleMs),
    };
    return account;
  } finally {
    seed.fill(0);
  }
}

/** Creates a passkey for Mera and its keys; returns the key's address, which owns the account. */
export async function createMeraKey(settings: ClientSettings, name: string) {
  const created = await createPasskeyWithPrfOutput({
    rp: { id: settings.passkeyRpId, name: 'GatoPago' },
    user: { name, displayName: name },
  });
  const account = await openMeraSession(settings, created.credentialId, created.prfOutput);
  return { credentialId: created.credentialId, address: account.address };
}

/**
 * Asks for a Mera passkey (`credentialId`, or any of the site's when unknown) and opens a session
 * with its keys; returns the key's address.
 */
export async function unlockMeraKey(settings: ClientSettings, credentialId?: string) {
  const { credentialId: used, prfOutput } = await getPasskeyPrfOutput({
    rpId: settings.passkeyRpId,
    credential: credentialId ? { credentialId } : undefined,
  });
  const account = await openMeraSession(settings, used, prfOutput);
  return { credentialId: used, address: account.address };
}

/** The open session for the account owned by `owner`, after a passkey prompt if it ended. */
async function session(settings: ClientSettings, credentialId: string, owner: Address) {
  if (!current || current.credentialId !== credentialId)
    await unlockMeraKey(settings, credentialId);
  if (!current || !isAddressEqual(current.account.address, owner)) {
    endMeraSession();
    throw new Error('MERA_WRONG_PASSKEY');
  }
  clearTimeout(current.timer);
  current.timer = setTimeout(endMeraSession, current.idleMs);
  return current;
}

/**
 * The signer for a Mera account owned by `owner`: the open session, kept alive by this use, or a
 * new one after a passkey prompt.
 */
export async function meraSigner(
  settings: ClientSettings,
  credentialId: string,
  owner: Address,
): Promise<LocalAccount> {
  return (await session(settings, credentialId, owner)).account;
}

/** The Stellar key of a Mera account owned by `owner`, from the same session. */
export async function meraStellarKey(
  settings: ClientSettings,
  credentialId: string,
  owner: Address,
): Promise<StellarKey> {
  const { stellar } = await session(settings, credentialId, owner);
  if (!stellar) throw new Error('STELLAR_NOT_ENABLED');
  return {
    type: 'ed25519',
    publicKey: bytesToHex(stellar.publicKey),
    signMessage: (message) => stellar.signMessage(message),
  };
}
