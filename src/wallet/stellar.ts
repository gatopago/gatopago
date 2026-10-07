import type { Address, Hex } from 'viem';
import { crosschainFee } from '@gatopago/shared/crosschain';
import { stellarNetwork, walletNetwork } from '@gatopago/shared/networks';
import { keyOwner } from '@gatopago/shared/wallet';
import type { ClientSettings } from '../lib/settings';
import { invalidateActivity } from './activity';
import { api, ApiError } from './api';
import type { Session } from './session';

/**
 * Stellar, a secondary network: the account's Stellar address receives USDC, and its passkeys (or,
 * for a Mera account, the Stellar key Mera derives from the passkey) sign what Wallet Core sends
 * there and pays for. The Stellar SDK loads only when Stellar is on.
 */
const sdk = () => import('@gatopago/shared/stellar');
type Sdk = Awaited<ReturnType<typeof sdk>>;
type Operation = Parameters<Sdk['signedStellarCall']>[2]['operation'];
type StellarKey = Parameters<Sdk['signedStellarCall']>[2]['owner'];

/** The member's Stellar account, as Wallet Core derives it from the EVM address. */
export interface StellarAccount {
  readonly network: string;
  readonly account: string;
  readonly deployed: boolean;
  /** Simulates and pays its transactions. */
  readonly sponsor: string;
  /** Ed25519 keys approved to sign too, each while its EVM `owner` key owns the account. */
  readonly keys: readonly { public_key: Hex; owner: Address }[];
}

/** The approved Ed25519 keys whose approving key is among the account's `owners`. */
const signingKeys = (stellar: StellarAccount, owners: readonly Hex[]) =>
  stellar.keys
    .filter(({ owner }) => owners.some((current) => current.toLowerCase() === keyOwner(owner)))
    .map(({ public_key }) => public_key);

const accounts = new Map<string, Promise<StellarAccount | null>>();
const key = (address: Address) => address.toLowerCase();

/** The signed-in member's Stellar account, or null when Stellar is off here or in Wallet Core. */
export function stellarAccount(
  settings: ClientSettings,
  session: Session,
): Promise<StellarAccount | null> {
  if (!settings.stellar) return Promise.resolve(null);
  let account = accounts.get(key(session.wallet.address));
  if (!account) {
    account = api<StellarAccount>(settings.apiOrigin, 'stellar', { token: session.token }).catch(
      (error: unknown) => {
        if (error instanceof ApiError && error.code === 'STELLAR_NOT_ENABLED') return null;
        accounts.delete(key(session.wallet.address));
        throw error;
      },
    );
    accounts.set(key(session.wallet.address), account);
  }
  return account;
}

/** The Stellar account of `address` once a screen asked for it (`stellarAccount`). */
export const knownStellarAccount = (address: Address) => accounts.get(key(address)) ?? null;

const network = (settings: ClientSettings) => stellarNetwork(settings.stellar!.network);

async function server(settings: ClientSettings) {
  const { stellarServer } = await sdk();
  return stellarServer(network(settings), settings.stellar!.rpcUrl);
}

/** USDC of a Stellar address in 6 decimals, like every network. */
export async function stellarBalance(settings: ClientSettings, owner: string): Promise<bigint> {
  const { fromStellarUnits, stellarUsdcBalance } = await sdk();
  return fromStellarUnits(
    await stellarUsdcBalance(await server(settings), network(settings), owner),
  );
}

/**
 * Checks that USDC can be sent to `recipient` on Stellar: a valid address, and for an account
 * (`G…`) one with a USDC trustline. Otherwise the payment would fail or, through CCTP, stay unminted.
 */
export async function checkStellarRecipient(settings: ClientSettings, recipient: string) {
  const { isStellarAddress } = await sdk();
  if (!isStellarAddress(recipient)) throw new Error('INVALID_STELLAR_ADDRESS');
  await stellarBalance(settings, recipient).catch(() => {
    throw new Error('STELLAR_RECIPIENT_CANNOT_RECEIVE');
  });
}

/**
 * Plans USDC to a Stellar address: from the Stellar account when it holds enough (no fee), else
 * through CCTP from the EVM network holding the most, whose `calls` burn it toward `recipient`.
 */
export async function planStellarSend(
  settings: ClientSettings,
  balances: Readonly<Record<string, bigint | null>>,
  stellarUsdc: bigint | null | undefined,
  recipient: string,
  amount: bigint,
) {
  if ((stellarUsdc ?? 0n) >= amount)
    return { from: settings.stellar!.network, fee: 0n, calls: null };
  const { crosschainToStellarCalls } = await sdk();
  const sources = Object.entries(balances)
    .filter(([, balance]) => (balance ?? 0n) > amount)
    .sort(([, a], [, b]) => ((b ?? 0n) > (a ?? 0n) ? 1 : -1));
  for (const [from, balance] of sources) {
    const fee = await crosschainFee(walletNetwork(from), network(settings), amount);
    if ((balance ?? 0n) >= amount + fee)
      return {
        from,
        fee,
        calls: crosschainToStellarCalls({
          from: walletNetwork(from),
          to: network(settings),
          amount: amount + fee,
          recipient,
          maxFee: fee,
        }),
      };
  }
  throw new Error('INSUFFICIENT_FUNDS');
}

/**
 * Moves `amount` of the account's Stellar USDC to its own address on the EVM network `to`, which
 * receives it minus at most `fee`. The first time, Circle's allowance is one more signature.
 */
export async function crosschainFromStellar(
  settings: ClientSettings,
  session: Session,
  move: { to: string; amount: bigint; fee: bigint },
) {
  await approveStellarBurns(settings, session, move.amount);
  return sendStellar(settings, session, (stellar, account) =>
    stellar.crosschainOperation(network(settings), {
      account,
      to: walletNetwork(move.to),
      amount: stellar.toStellarUnits(move.amount),
      recipient: session.wallet.address,
      maxFee: move.fee,
    }),
  );
}

/** EVM calls that move `amount` from `from` to the account's own Stellar address, minus `fee`. */
export async function crosschainToStellar(
  settings: ClientSettings,
  session: Session,
  move: { from: string; amount: bigint; fee: bigint },
) {
  const stellar = await stellarAccount(settings, session);
  if (!stellar) throw new Error('STELLAR_NOT_ENABLED');
  const { crosschainToStellarCalls } = await sdk();
  return crosschainToStellarCalls({
    from: walletNetwork(move.from),
    to: network(settings),
    amount: move.amount,
    recipient: stellar.account,
    maxFee: move.fee,
  });
}

/** Pays `amount` of the account's Stellar USDC to `recipient` on Stellar. */
export const sendOnStellar = (
  settings: ClientSettings,
  session: Session,
  recipient: string,
  amount: bigint,
) =>
  sendStellar(settings, session, (stellar, account) =>
    stellar.transferOperation(
      network(settings),
      account,
      recipient,
      stellar.toStellarUnits(amount),
    ),
  );

/**
 * How many signer changes the Stellar account needs to match the EVM account's `owners`: `null`
 * when Stellar is off, `'unused'` before the account exists (it is created with the owners then).
 */
export async function stellarSignerChanges(
  settings: ClientSettings,
  session: Session,
  owners: readonly Hex[],
): Promise<number | 'unused' | null> {
  const stellar = await stellarAccount(settings, session);
  if (!stellar) return null;
  const { signerChangeOperations, stellarAccountExists } = await sdk();
  const client = await server(settings);
  if (!(await stellarAccountExists(client, stellar.account))) return 'unused';
  return (
    await signerChangeOperations(
      client,
      network(settings),
      stellar.account,
      owners,
      signingKeys(stellar, owners),
    )
  ).length;
}

/** Makes the Stellar account's signers the passkeys among `owners`: one signature per change. */
export async function syncStellarSigners(
  settings: ClientSettings,
  session: Session,
  owners: readonly Hex[],
) {
  const stellar = await stellarAccount(settings, session);
  if (!stellar) return;
  const { signerChangeOperations, stellarAccountExists } = await sdk();
  const client = await server(settings);
  if (!(await stellarAccountExists(client, stellar.account))) return;
  for (const change of await signerChangeOperations(
    client,
    network(settings),
    stellar.account,
    owners,
    signingKeys(stellar, owners),
  ))
    await sendStellar(settings, session, () => change);
}

/** A signed call sent from this browser whose result it has not seen yet. */
interface Pending {
  nonce: string;
  /** After this ledger, a call that did not land never will. */
  validUntil: number;
}

const pendingKey = (account: string) => `gatopago.pending.stellar.${account}`;

function remember(account: string, pending: Pending) {
  try {
    localStorage.setItem(pendingKey(account), JSON.stringify(pending));
  } catch {
    // Without storage the call is still awaited; only a reload loses track of it.
  }
}

function forget(account: string) {
  try {
    localStorage.removeItem(pendingKey(account));
  } catch {
    // Nothing was stored.
  }
}

function recall(account: string): Pending | null {
  try {
    return JSON.parse(localStorage.getItem(pendingKey(account)) ?? 'null');
  } catch {
    return null;
  }
}

/**
 * Settles the last call sent from this browser before another one, as on EVM: landed (Wallet Core
 * sent it, or the network used its nonce) stops the new attempt; still valid means it may land.
 */
async function settlePending(settings: ClientSettings, session: Session, account: string) {
  const pending = recall(account);
  if (!pending) return;
  const { stellarNonceUsed } = await sdk();
  const client = await server(settings);
  const sent = await api(settings.apiOrigin, `stellar/submit?nonce=${pending.nonce}`, {
    token: session.token,
  }).then(
    () => true,
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 404) return false;
      throw error;
    },
  );
  if (sent || (await stellarNonceUsed(client, account, pending.nonce))) {
    forget(account);
    invalidateActivity(session.token);
    throw new Error('PREVIOUS_OPERATION_CONFIRMED');
  }
  if ((await client.getLatestLedger()).sequence <= pending.validUntil)
    throw new Error('OPERATION_PENDING');
  forget(account);
}

/**
 * This device's Stellar key: its passkey, or for a Mera account the Stellar key Mera derives,
 * approved first by the account's Mera key (one signature in the open session, no prompt) so that
 * Wallet Core adds it as a signer.
 */
async function deviceKey(settings: ClientSettings, session: Session, stellar: StellarAccount) {
  const { wallet, token } = session;
  if (!wallet.meraOwner) {
    const { toWebAuthnAccount } = await import('viem/account-abstraction');
    return {
      stellar,
      owner: toWebAuthnAccount({
        credential: { id: wallet.credentialId, publicKey: wallet.publicKey },
      }) as StellarKey,
    };
  }
  const { meraSigner, meraStellarKey } = await import('./mera');
  const owner = await meraStellarKey(settings, wallet.credentialId, wallet.meraOwner);
  if (stellar.keys.some(({ public_key }) => public_key === owner.publicKey.toLowerCase()))
    return { stellar, owner };
  const { stellarKeyApproval } = await sdk();
  const evm = await meraSigner(settings, wallet.credentialId, wallet.meraOwner);
  // A short-lived approval: an old one cannot bring the key back later.
  const expiresAt = Math.floor(Date.now() / 1000) + 600;
  await api(settings.apiOrigin, 'stellar/keys', {
    token,
    body: {
      public_key: owner.publicKey,
      signature: await evm.signMessage({
        message: stellarKeyApproval(network(settings), wallet.address, owner.publicKey, expiresAt),
      }),
      expires_at: expiresAt,
      initial_owners: wallet.initialOwners,
    },
  });
  // An account created before the key was approved signs with it once synced from Security.
  if (stellar.deployed) throw new Error('STELLAR_SIGNER_PENDING');
  const updated = {
    ...stellar,
    keys: [
      ...stellar.keys,
      { public_key: owner.publicKey.toLowerCase() as Hex, owner: wallet.meraOwner },
    ],
  };
  accounts.set(key(wallet.address), Promise.resolve(updated));
  return { stellar: updated, owner };
}

/**
 * Sends a call of the member's Stellar account, built by `operation`, signed by this device's key
 * (`deviceKey`); Wallet Core pays its fee. The account is created first if needed. Returns the
 * Stellar transaction hash.
 */
export async function sendStellar(
  settings: ClientSettings,
  session: Session,
  operation: (stellar: Sdk, account: string) => Operation | Promise<Operation>,
): Promise<string> {
  const { wallet, token } = session;
  const found = await stellarAccount(settings, session);
  if (!found) throw new Error('STELLAR_NOT_ENABLED');
  const lib = await sdk();
  await settlePending(settings, session, found.account);
  const { stellar, owner } = await deviceKey(settings, session, found);
  if (!stellar.deployed) {
    await api(settings.apiOrigin, 'stellar/account', {
      token,
      body: { initial_owners: wallet.initialOwners },
    });
    accounts.set(key(wallet.address), Promise.resolve({ ...stellar, deployed: true }));
  }
  const call = await lib.signedStellarCall(await server(settings), network(settings), {
    sponsor: stellar.sponsor,
    operation: await operation(lib, stellar.account),
    owner,
  });
  remember(stellar.account, { nonce: call.nonces[0], validUntil: call.validUntil });
  let hash: string;
  try {
    ({ transaction_hash: hash } = await api<{ transaction_hash: string }>(
      settings.apiOrigin,
      'stellar/submit',
      { token, body: { func: call.func, auth: call.auth } },
    ));
  } catch (error) {
    // Unanswered, or sent but not seen yet: it may still land, so it stays remembered.
    if (
      !(error instanceof ApiError) ||
      error.status === 0 ||
      error.status >= 500 ||
      error.code === 'STELLAR_TRANSACTION_PENDING'
    )
      throw new Error('OPERATION_PENDING', { cause: error });
    forget(stellar.account);
    throw error;
  }
  forget(stellar.account);
  invalidateActivity(token);
  return hash;
}

/** Lets Circle burn the account's USDC when its allowance does not cover `amount` (6 decimals). */
export async function approveStellarBurns(
  settings: ClientSettings,
  session: Session,
  amount: bigint,
) {
  const stellar = await stellarAccount(settings, session);
  if (!stellar) throw new Error('STELLAR_NOT_ENABLED');
  const { BURN_APPROVAL_LEDGERS, approveBurnsOperation, stellarBurnAllowance, toStellarUnits } =
    await sdk();
  const client = await server(settings);
  if (
    (await stellarBurnAllowance(client, network(settings), stellar.account)) >=
    toStellarUnits(amount)
  )
    return;
  const latest = (await client.getLatestLedger()).sequence;
  await sendStellar(settings, session, (_, account) =>
    approveBurnsOperation(network(settings), account, latest + BURN_APPROVAL_LEDGERS),
  );
}

/**
 * Whether a CCTP burn toward Stellar (`hash` on `from`) arrived: Wallet Core mints it once Circle
 * attests it. A burn it does not know yet is reported to it.
 */
export async function stellarArrived(
  settings: ClientSettings,
  session: Session,
  from: string,
  hash: string,
): Promise<boolean> {
  try {
    const { status } = await api<{ status: 'pending' | 'delivered' | 'rejected' }>(
      settings.apiOrigin,
      `stellar/relays?transaction_hash=${hash}`,
      { token: session.token },
    );
    if (status === 'rejected') throw new Error('STELLAR_RELAY_REJECTED');
    return status === 'delivered';
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
    await api(settings.apiOrigin, 'stellar/relays', {
      token: session.token,
      body: { network: from, transaction_hash: hash },
    });
    return false;
  }
}
