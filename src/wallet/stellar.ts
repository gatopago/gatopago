import { isAddressEqual, recoverMessageAddress, type Address, type Hex } from 'viem';
import { crosschainFee } from '@gatopago/shared/crosschain';
import { stellarNetwork, walletNetwork } from '@gatopago/shared/networks';
import { keyOwner } from '@gatopago/shared/wallet';
import type { ClientSettings } from '../lib/settings';
import { holdPageReload } from '../pwa/reload-guard';
import { invalidateActivity } from './activity';
import { api, ApiError } from './api';
import type { MeraKeys } from './mera';
import type { Session } from './session';

/**
 * Stellar, a secondary network: the account's Stellar address receives USDC, and its passkeys (or,
 * for a Mera account, the Stellar key Mera derives from the passkey) sign what Wallet Core sends
 * there and pays for. The Stellar SDK loads only when Stellar is on.
 */
const sdk = () => import('@gatopago/shared/stellar');
type Sdk = Awaited<ReturnType<typeof sdk>>;
type Operation = Parameters<Sdk['signedStellarCall']>[2]['operation'];

/** The member's Stellar account, as Wallet Core derives it from the EVM address. */
interface StellarAccount {
  readonly network: string;
  readonly account: string;
  readonly deployed: boolean;
  /** Simulates and pays its transactions. */
  readonly sponsor: string;
  /**
   * Ed25519 keys approved to sign, each while its EVM `owner` key owns the account, with the
   * approval itself (`StellarKeyApproval`).
   */
  readonly keys: readonly (StellarKeyApproval & { owner: Address })[];
}

/**
 * The approved Ed25519 keys whose approving key is among the account's `owners` (verified by the
 * caller), each approval checked here: a key Wallet Core listed on its own is never signed in.
 */
async function signingKeys(
  settings: ClientSettings,
  account: Address,
  stellar: StellarAccount,
  owners: readonly Hex[],
) {
  const { stellarKeyApproval } = await sdk();
  const checked = await Promise.all(
    stellar.keys.map(async (approved) => {
      if (!owners.some((current) => current.toLowerCase() === keyOwner(approved.owner)))
        return null;
      const signer = await recoverMessageAddress({
        message: stellarKeyApproval(
          network(settings),
          account,
          approved.public_key,
          approved.expires_at,
        ),
        signature: approved.signature,
      }).catch(() => null);
      return signer && isAddressEqual(signer, approved.owner) ? approved.public_key : null;
    }),
  );
  return checked.filter((key) => key !== null);
}

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

/** The member's Stellar account read again: its approved keys may have changed elsewhere. */
function freshStellarAccount(settings: ClientSettings, session: Session) {
  accounts.delete(key(session.wallet.address));
  return stellarAccount(settings, session);
}

/** The Stellar account of `address` once a screen asked for it (`stellarAccount`). */
export const knownStellarAccount = (address: Address) => accounts.get(key(address)) ?? null;

const network = (settings: ClientSettings) => stellarNetwork(settings.stellar!.network);

async function server(settings: ClientSettings) {
  const { stellarServer } = await sdk();
  return stellarServer(network(settings), settings.stellar!.rpcUrl);
}

/** The coins the Stellar account holds and sends: USDC, and XLM, the network's own. */
type StellarCoin = 'USDC' | 'XLM';

/** USDC of a Stellar address in 6 decimals, like every network. */
export async function stellarBalance(settings: ClientSettings, owner: string): Promise<bigint> {
  const { fromStellarUnits, stellarUsdcBalance } = await sdk();
  return fromStellarUnits(
    await stellarUsdcBalance(await server(settings), network(settings), owner),
  );
}

/** XLM of a Stellar address, in its 7 decimals. */
export async function stellarXlmBalance(settings: ClientSettings, owner: string): Promise<bigint> {
  const lib = await sdk();
  return lib.stellarBalance(
    await server(settings),
    network(settings),
    network(settings).xlm,
    owner,
  );
}

/**
 * Checks that `coin` can be sent to `recipient` on Stellar: a valid address, and for an account
 * (`G…`) one that can hold it (a USDC trustline; for XLM, that it exists). Otherwise the payment
 * would fail or, through CCTP, stay unminted.
 */
export async function checkStellarRecipient(
  settings: ClientSettings,
  recipient: string,
  coin: StellarCoin = 'USDC',
) {
  const { isStellarAddress } = await sdk();
  if (!isStellarAddress(recipient)) throw new Error('INVALID_STELLAR_ADDRESS');
  await (coin === 'XLM' ? stellarXlmBalance : stellarBalance)(settings, recipient).catch(() => {
    throw new Error(
      coin === 'XLM' ? 'STELLAR_ACCOUNT_INACTIVE' : 'STELLAR_RECIPIENT_CANNOT_RECEIVE',
    );
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
    .filter(([, balance]) => (balance ?? 0n) >= amount)
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
 * receives it minus at most `fee`. Without Circle's allowance for it (`stellarBurnsAllowed`), the
 * allowance is one more signature first; `onStep` says which one is being asked.
 */
export async function crosschainFromStellar(
  settings: ClientSettings,
  session: Session,
  move: { to: string; amount: bigint; fee: bigint },
  onStep?: (step: 'allowance' | 'move') => void,
) {
  if (!(await stellarBurnsAllowed(settings, session, move.amount))) {
    onStep?.('allowance');
    await approveStellarBurns(settings, session);
  }
  onStep?.('move');
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

/**
 * Pays `amount` of the account's Stellar `coin` to `recipient` on Stellar: USDC in 6 decimals, like
 * every network, or XLM in its 7.
 */
export const sendOnStellar = (
  settings: ClientSettings,
  session: Session,
  recipient: string,
  amount: bigint,
  coin: StellarCoin = 'USDC',
) =>
  sendStellar(settings, session, (stellar, account) =>
    coin === 'XLM'
      ? stellar.transferOperation(
          network(settings),
          account,
          recipient,
          amount,
          network(settings).xlm,
        )
      : stellar.transferOperation(
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
  const stellar = await freshStellarAccount(settings, session);
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
      await signingKeys(settings, session.wallet.address, stellar, owners),
    )
  ).length;
}

/** Makes the Stellar account's signers the passkeys among `owners`: one signature per change. */
export async function syncStellarSigners(
  settings: ClientSettings,
  session: Session,
  owners: readonly Hex[],
) {
  const stellar = await freshStellarAccount(settings, session);
  if (!stellar) return;
  const { signerChangeOperations, stellarAccountExists } = await sdk();
  const client = await server(settings);
  if (!(await stellarAccountExists(client, stellar.account))) return;
  for (const change of await signerChangeOperations(
    client,
    network(settings),
    stellar.account,
    owners,
    await signingKeys(settings, session.wallet.address, stellar, owners),
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

/** Without storage nothing is sent: a lost answer could not be told apart from a failure. */
function remember(account: string, pending: Pending) {
  try {
    localStorage.setItem(pendingKey(account), JSON.stringify(pending));
  } catch (error) {
    throw new Error('STORAGE_UNAVAILABLE', { cause: error });
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

/** Device keys seen signing for an account (`account:key`), so a send checks the network once. */
const signing = new Set<string>();

/** An approval of an Ed25519 key, signed by an owner key of the EVM account (`stellarKeyApproval`). */
interface StellarKeyApproval {
  public_key: Hex;
  signature: Hex;
  expires_at: number;
}

/**
 * Approves the Stellar key of `keys` for `account`, signed by the EVM key of the same passkey: valid
 * for Wallet Core while that key owns the account. Short-lived, so an old one cannot bring the key
 * back later. Null when Stellar is off.
 */
export async function approveStellarKey(
  settings: ClientSettings,
  account: Address,
  keys: MeraKeys,
): Promise<StellarKeyApproval | null> {
  if (!settings.stellar || !keys.stellar) return null;
  const { stellarKeyApproval } = await sdk();
  const publicKey = keys.stellar.publicKey.toLowerCase() as Hex;
  const expiresAt = Math.floor(Date.now() / 1000) + 600;
  return {
    public_key: publicKey,
    signature: await keys.account.signMessage({
      message: stellarKeyApproval(network(settings), account, publicKey, expiresAt),
    }),
    expires_at: expiresAt,
  };
}

/** Hands `approval` to Wallet Core, which adds the key as a signer when it creates the account. */
export async function registerStellarKey(
  settings: ClientSettings,
  session: Session,
  approval: StellarKeyApproval,
) {
  await api(settings.apiOrigin, 'stellar/keys', {
    token: session.token,
    body: { ...approval, initial_owners: session.wallet.initialOwners },
  });
}

/**
 * This device's Stellar key: the one Mera derives from its passkey, approved once by its EVM key
 * (one signature in the open session, no prompt) so that Wallet Core adds it as a signer. On an
 * account created before that approval, the key signs only once a device that already signs there
 * syncs it from Security.
 */
async function deviceKey(settings: ClientSettings, session: Session, found: StellarAccount) {
  const { wallet } = session;
  const { meraSigner, meraStellarKey } = await import('./mera');
  const owner = await meraStellarKey(settings, wallet.credentialId, wallet.owner);
  const publicKey = owner.publicKey.toLowerCase() as Hex;
  let stellar = found;
  const lib = await sdk();
  if (!stellar.keys.some(({ public_key }) => public_key === publicKey)) {
    const account = await meraSigner(settings, wallet.credentialId, wallet.owner);
    const approval = (await approveStellarKey(settings, wallet.address, {
      account,
      stellar: owner,
    }))!;
    await registerStellarKey(settings, session, approval);
    stellar = { ...stellar, keys: [...stellar.keys, { ...approval, owner: wallet.owner }] };
    accounts.set(key(wallet.address), Promise.resolve(stellar));
  }
  const id = `${stellar.account}:${publicKey}`;
  if (stellar.deployed && !signing.has(id)) {
    const signs = await lib.isStellarKeySigner(
      await server(settings),
      network(settings),
      stellar.account,
      publicKey,
    );
    if (!signs) throw new Error('STELLAR_SIGNER_PENDING');
    signing.add(id);
  }
  return { stellar, owner };
}

/**
 * Sends a call of the member's Stellar account, built by `operation`, signed by this device's key
 * (`deviceKey`); Wallet Core pays its fee. The account is created first if needed. Returns the
 * Stellar transaction hash.
 */
async function sendStellar(
  settings: ClientSettings,
  session: Session,
  operation: (stellar: Sdk, account: string) => Operation | Promise<Operation>,
): Promise<string> {
  // Nothing reloads the page or leaves the screen until the result is known (`reload-guard`).
  const release = holdPageReload();
  try {
    return await signAndSubmit(settings, session, operation);
  } finally {
    release();
  }
}

async function signAndSubmit(
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

/** Whether Circle may already burn `amount` (6 decimals) of the account's Stellar USDC. */
export async function stellarBurnsAllowed(
  settings: ClientSettings,
  session: Session,
  amount: bigint,
) {
  const stellar = await stellarAccount(settings, session);
  if (!stellar) throw new Error('STELLAR_NOT_ENABLED');
  const { stellarBurnAllowance, toStellarUnits } = await sdk();
  return (
    (await stellarBurnAllowance(await server(settings), network(settings), stellar.account)) >=
    toStellarUnits(amount)
  );
}

/** Lets Circle burn the account's Stellar USDC for about six months (`BURN_APPROVAL_LEDGERS`). */
async function approveStellarBurns(settings: ClientSettings, session: Session) {
  const { BURN_APPROVAL_LEDGERS, approveBurnsOperation } = await sdk();
  const client = await server(settings);
  const latest = (await client.getLatestLedger()).sequence;
  await sendStellar(settings, session, (_, account) =>
    approveBurnsOperation(network(settings), account, latest + BURN_APPROVAL_LEDGERS),
  );
}

/** Where a CCTP burn toward Stellar stands: Wallet Core mints it once Circle attests it. */
export type StellarDelivery = 'pending' | 'delivered' | 'rejected';

/**
 * Whether a CCTP burn toward Stellar (`hash` on `from`) arrived, still waits, or was rejected for
 * good (not a burn of this member toward Stellar). A burn Wallet Core does not know yet is reported.
 */
export async function stellarArrived(
  settings: ClientSettings,
  session: Session,
  from: string,
  hash: string,
): Promise<StellarDelivery> {
  try {
    const { status } = await api<{ status: StellarDelivery }>(
      settings.apiOrigin,
      `stellar/relays?transaction_hash=${hash}`,
      { token: session.token },
    );
    return status;
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
    await api(settings.apiOrigin, 'stellar/relays', {
      token: session.token,
      body: { network: from, transaction_hash: hash },
    });
    return 'pending';
  }
}
