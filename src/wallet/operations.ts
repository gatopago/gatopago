import { BaseError, http, HttpRequestError, RpcRequestError, type Address, type Hex } from 'viem';
import {
  createBundlerClient,
  createPaymasterClient,
  formatUserOperationRequest,
  getUserOperationHash,
  UserOperationReceiptNotFoundError,
} from 'viem/account-abstraction';
import { walletNetwork } from '@gatopago/shared/networks';
import {
  REPLAYABLE_NONCE_KEY,
  SPONSORSHIP_SECONDS,
  encodeApplyApproval,
  gatopagoAccountAbi,
} from '@gatopago/shared/wallet';
import type { ClientSettings } from '../lib/settings';
import { holdPageReload } from '../pwa/reload-guard';
import { gatopagoAccount, publicClient } from './account';
import { invalidateActivity } from './activity';
import { api, type Approvals } from './api';
import type { Session } from './session';

/**
 * Sends sponsored calls after applying the account's pending owner approvals. The operation is
 * remembered until its result is known: if the answer is lost (closed tab, timeout, offline), the
 * next attempt on that network finds out what happened instead of paying a second time.
 */
export async function send(
  settings: ClientSettings,
  session: Session,
  networkId: string,
  calls: readonly { to: Address; data: Hex; value?: bigint }[],
): Promise<Hex> {
  // Nothing reloads the page or leaves the screen until the result is known (`reload-guard`).
  const release = holdPageReload();
  try {
    const account = await gatopagoAccount(settings, session.wallet, networkId);
    const bundler = bundlerClient(settings, session, networkId, account);
    await settlePending(account, bundler, networkId, session.token);
    await applyApprovals(settings, session, networkId, account, bundler);
    // One sequence (key 0) for spending: operations land in order.
    const nonce = await account.getNonce({ key: 0n });
    const prepared = await bundler.prepareUserOperation({ calls, nonce });
    const userOperation = { ...prepared, signature: await account.signUserOperation(prepared) };
    const hash = getUserOperationHash({
      chainId: walletNetwork(networkId).chain.id,
      entryPointAddress: account.entryPoint.address,
      entryPointVersion: account.entryPoint.version,
      userOperation,
    });
    // Remembered before it is sent: if the answer is lost, this same operation is the one to look for.
    remember(account.address, networkId, { hash, expiresAt: Date.now() + PENDING_MS });
    try {
      await bundler.request(
        {
          method: 'eth_sendUserOperation',
          params: [formatUserOperationRequest(userOperation), account.entryPoint.address],
        },
        { retryCount: 0 },
      );
    } catch (error) {
      if (!refused(error)) throw new Error('OPERATION_PENDING', { cause: error });
      forget(account.address, networkId);
      throw error;
    }
    let result;
    try {
      result = await bundler.waitForUserOperationReceipt({ hash });
    } catch (error) {
      throw new Error('OPERATION_PENDING', { cause: error });
    }
    forget(account.address, networkId);
    if (!result.success) throw new Error('OPERATION_REVERTED');
    invalidateActivity(session.token);
    return result.receipt.transactionHash;
  } finally {
    release();
  }
}

/**
 * Whether sending failed for certain: the bundler answered with an error other than an internal
 * one, or Wallet Core refused the request (4xx). Anything else (no answer, a 5xx) may have sent it.
 */
function refused(error: unknown) {
  if (!(error instanceof BaseError)) return false;
  const rpc = error.walk((cause) => cause instanceof RpcRequestError);
  if (rpc instanceof RpcRequestError) return rpc.code !== -32603;
  const request = error.walk((cause) => cause instanceof HttpRequestError);
  const status = request instanceof HttpRequestError ? request.status : undefined;
  return status !== undefined && status >= 400 && status < 500;
}

/**
 * Whether the bundler answered that it has no included operation for a hash: no receipt, or the
 * bundle known not to include it (`-32500`). Any other failure is a question left unanswered.
 */
function unknownToBundler(error: unknown) {
  if (error instanceof UserOperationReceiptNotFoundError) return true;
  const rpc = error instanceof BaseError && error.walk((cause) => cause instanceof RpcRequestError);
  return rpc instanceof RpcRequestError && rpc.code === -32500;
}

/** A sent operation whose result the app has not seen yet. */
interface Pending {
  hash: Hex;
  /** After this, an operation still not included can no longer be (its sponsorship expired). */
  expiresAt: number;
}

/** A sponsorship's lifetime, plus a minute for a bundle sent at its end to land. */
const PENDING_MS = (SPONSORSHIP_SECONDS + 60) * 1000;
const pendingKey = (account: Address, networkId: string) =>
  `gatopago.pending.${networkId}.${account.toLowerCase()}`;

/** Without storage nothing is sent: a lost answer could not be told apart from a failure. */
function remember(account: Address, networkId: string, pending: Pending) {
  try {
    localStorage.setItem(pendingKey(account, networkId), JSON.stringify(pending));
  } catch (error) {
    throw new Error('STORAGE_UNAVAILABLE', { cause: error });
  }
}

function forget(account: Address, networkId: string) {
  try {
    localStorage.removeItem(pendingKey(account, networkId));
  } catch {
    // Nothing was stored.
  }
}

function recall(account: Address, networkId: string): Pending | null {
  try {
    return JSON.parse(localStorage.getItem(pendingKey(account, networkId)) ?? 'null');
  } catch {
    return null;
  }
}

/**
 * Settles the last operation sent from this browser on `networkId` before another one, by its own
 * receipt: succeeded stops the new attempt so the person checks it first; reverted means nothing
 * was paid. The bundler records an operation before sending it, so one it does not know is not
 * included: it may still be while its sponsorship lasts, and never after. Without an answer from
 * the bundler, it stays remembered. (A moved nonce proves nothing: a reverted execution or
 * another device's operation also uses it.)
 */
async function settlePending(
  account: Awaited<ReturnType<typeof gatopagoAccount>>,
  bundler: ReturnType<typeof bundlerClient>,
  networkId: string,
  token: string,
) {
  const pending = recall(account.address, networkId);
  if (!pending) return;
  const receipt = await bundler
    .getUserOperationReceipt({ hash: pending.hash })
    .catch((error: unknown) => {
      if (unknownToBundler(error)) return null;
      // Not answered (offline, 5xx, 401, 429…): the result stays unknown and the hash is kept.
      throw new Error('OPERATION_PENDING', { cause: error });
    });
  if (receipt === null && Date.now() < pending.expiresAt) throw new Error('OPERATION_PENDING');
  forget(account.address, networkId);
  if (receipt) {
    invalidateActivity(token);
    if (receipt.success) throw new Error('PREVIOUS_OPERATION_CONFIRMED');
  }
}

/** Replays the user's stored owner approvals in order, without another passkey prompt. */
export async function applyApprovals(
  settings: ClientSettings,
  session: Session,
  networkId: string,
  account?: Awaited<ReturnType<typeof gatopagoAccount>>,
  bundler?: ReturnType<typeof bundlerClient>,
) {
  account ??= await gatopagoAccount(settings, session.wallet, networkId);
  bundler ??= bundlerClient(settings, session, networkId, account);
  const { approvals } = await api<Approvals>(settings.apiOrigin, `approvals/${account.address}`);
  const applied = (await appliedApprovals(settings, account.address, networkId)) ?? 0;
  for (const approval of approvals.slice(applied)) {
    const hash = await bundler.sendUserOperation({
      callData: encodeApplyApproval(BigInt(approval.sequence), approval.call),
      nonce: await account.getNonce({ key: REPLAYABLE_NONCE_KEY }),
      signature: approval.signature,
    });
    const { success } = await bundler.waitForUserOperationReceipt({ hash });
    if (!success) throw new Error('OPERATION_REVERTED');
  }
}

/** The applied approval count, or null where the account is not deployed. */
export async function appliedApprovals(
  settings: ClientSettings,
  address: Address,
  networkId: string,
): Promise<number | null> {
  const client = publicClient(settings, networkId);
  if (!(await client.getCode({ address }))) return null;
  const sequence = await client.readContract({
    address,
    abi: gatopagoAccountAbi,
    functionName: 'approvalSequence',
  });
  return Number(sequence);
}

function bundlerClient(
  settings: ClientSettings,
  session: Session,
  networkId: string,
  account: Awaited<ReturnType<typeof gatopagoAccount>>,
) {
  const service = (name: string) =>
    http(`${settings.apiOrigin}/app/v1/${name}/${networkId}`, {
      fetchOptions: { headers: { Authorization: `Bearer ${session.token}` } },
    });
  return createBundlerClient({
    account,
    client: publicClient(settings, networkId),
    transport: service('bundler'),
    paymaster: createPaymasterClient({ transport: service('paymaster') }),
  });
}
