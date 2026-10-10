import {
  createEd25519SigningSession,
  createSecp256k1SigningSession,
  getPasskeyPrfOutput,
  type Ed25519SigningSession,
  type Secp256k1SigningSession,
} from '@category-labs/mera';
import { toViemAccount } from '@category-labs/mera/viem';
import { bytesToHex, isAddressEqual, type Address, type LocalAccount } from 'viem';
import {
  meraEvmKey,
  meraSeed,
  PASSKEY_PROMPT_MS,
  stellarKeyFromSeed,
} from '@gatopago/shared/passkey';
import type { StellarKey } from '@gatopago/shared/stellar';
import type { ClientSettings } from '../lib/settings';
import { currentSession, subscribeSession } from './session';

/**
 * Mera (Category Labs): a passkey's PRF output derives the keys of a GatoPago account, through the
 * same factory and paymaster: an Ethereum key that owns the EVM account and, when Stellar is on, a
 * Stellar key that signs for its Stellar account. One fingerprint opens a signing session; while
 * it lasts, payments need no prompt. The keys live only in memory and the session ends after
 * `settings.meraSessionMinutes` without use or when the page goes away, so a closed app always
 * asks again. A key copied while in memory keeps working until the account removes it: this is a
 * software key, unlike the passkey itself.
 */

let current: {
  credentialId: string;
  session: Secp256k1SigningSession;
  account: LocalAccount;
  /** The Stellar key (SEP-5, `m/44'/148'/0'`), when Stellar is on. */
  stellar: Ed25519SigningSession | null;
  idleMs: number;
  timer: ReturnType<typeof setTimeout>;
} | null = null;

/** Counts endings, so a passkey prompt answered after one opens nothing. */
let endings = 0;

/** Ends the signing session: the next signature needs the passkey again. */
export function endMeraSession() {
  endings++;
  if (!current) return;
  clearTimeout(current.timer);
  current.session.end();
  current.stellar?.end();
  current = null;
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', endMeraSession);
  // Signing out (here, in another tab, or an expired or rejected session) ends it at once, and so
  // does signing in with another passkey.
  subscribeSession(() => {
    const session = currentSession();
    if (!session || (current && session.wallet.credentialId !== current.credentialId))
      endMeraSession();
  });
}

/**
 * Starts a session for the keys `prfOutput` derives, zeroing it and the intermediate secrets. One
 * ended meanwhile (signing out while the Stellar key derives) opens nothing: `SIGNED_OUT`.
 */
export async function openMeraSession(
  settings: ClientSettings,
  credentialId: string,
  prfOutput: Uint8Array,
): Promise<LocalAccount> {
  endMeraSession();
  const started = endings;
  const seed = meraSeed(prfOutput);
  prfOutput.fill(0);
  try {
    const privateKey = meraEvmKey(seed);
    const session = createSecp256k1SigningSession({ privateKey });
    privateKey.fill(0);
    let stellar: Ed25519SigningSession | null = null;
    if (settings.stellar) {
      const stellarKey = await stellarKeyFromSeed(seed);
      stellar = createEd25519SigningSession({ privateKey: stellarKey });
      stellarKey.fill(0);
    }
    if (endings !== started) {
      session.end();
      stellar?.end();
      throw new Error('SIGNED_OUT');
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

/** The passkey prompt being shown, shared by everything that needs the session meanwhile. */
let unlocking: Promise<{ credentialId: string; address: Address }> | null = null;

/**
 * Asks for a Mera passkey (`credentialId`, or any of the site's when unknown) and opens a session
 * with its keys; returns the key's address. One prompt at a time: a second request while one is
 * open would wait behind it or be refused by the browser, so it gets the same answer. A prompt
 * that is never answered ends after `PASSKEY_PROMPT_MS`, so no screen waits forever.
 */
function unlockMeraKey(settings: ClientSettings, credentialId?: string) {
  const started = endings;
  unlocking ??= getPasskeyPrfOutput({
    rpId: settings.passkeyRpId,
    credential: credentialId ? { credentialId } : undefined,
    timeout: PASSKEY_PROMPT_MS,
  })
    .then(async ({ credentialId: used, prfOutput }) => {
      // Signed out while the prompt was open: the answer opens nothing.
      if (endings !== started) {
        prfOutput.fill(0);
        throw new Error('SIGNED_OUT');
      }
      const account = await openMeraSession(settings, used, prfOutput);
      return { credentialId: used, address: account.address };
    })
    .finally(() => {
      unlocking = null;
    });
  return unlocking;
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

/** The keys Mera derives from one passkey's PRF output, while they are in memory. */
export interface MeraKeys {
  readonly account: LocalAccount;
  readonly stellar: StellarKey | null;
}

/**
 * Runs `run` with the keys another passkey's PRF output derives (a backup key being added, or one
 * signing once), then wipes them: the session of the passkey in use is left as it was.
 */
export async function withMeraKeys<T>(
  settings: ClientSettings,
  prfOutput: Uint8Array,
  run: (keys: MeraKeys) => Promise<T>,
): Promise<T> {
  const seed = meraSeed(prfOutput);
  prfOutput.fill(0);
  const privateKey = meraEvmKey(seed);
  const evm = createSecp256k1SigningSession({ privateKey });
  privateKey.fill(0);
  let stellar: Ed25519SigningSession | null = null;
  try {
    if (settings.stellar) {
      const stellarKey = await stellarKeyFromSeed(seed);
      stellar = createEd25519SigningSession({ privateKey: stellarKey });
      stellarKey.fill(0);
    }
  } finally {
    seed.fill(0);
  }
  try {
    return await run({
      account: toViemAccount(evm),
      stellar: stellar && {
        type: 'ed25519',
        publicKey: bytesToHex(stellar.publicKey),
        signMessage: (message) => stellar!.signMessage(message),
      },
    });
  } finally {
    evm.end();
    stellar?.end();
  }
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
