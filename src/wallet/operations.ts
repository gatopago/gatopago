import { http, type Address, type Hex } from 'viem';
import {
  createBundlerClient,
  createPaymasterClient,
  UserOperationReceiptNotFoundError,
} from 'viem/account-abstraction';
import {
  REPLAYABLE_NONCE_KEY,
  SPONSORSHIP_SECONDS,
  encodeApplyApproval,
  gatopagoAccountAbi,
} from '@gatopago/shared/wallet';
import type { ClientSettings } from '../lib/settings';
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
  const account = await gatopagoAccount(settings, session.wallet, networkId);
  const bundler = bundlerClient(settings, session, networkId, account);
  await settlePending(account, bundler, networkId, session.token);
  await applyApprovals(settings, session, networkId, account, bundler);
  // One sequence (key 0) for spending: operations land in order and the nonce tells which did.
  const nonce = await account.getNonce({ key: 0n });
  const hash = await bundler.sendUserOperation({ calls, nonce });
  remember(account.address, networkId, {
    hash,
    nonce: nonce.toString(),
    expiresAt: Date.now() + PENDING_MS,
  });
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
}

/** A sent operation whose result the app has not seen yet. */
interface Pending {
  hash: Hex;
  nonce: string;
  /** After this, an operation still not included can no longer be (its sponsorship expired). */
  expiresAt: number;
}

/** A sponsorship's lifetime, plus a minute for a bundle sent at its end to land. */
const PENDING_MS = (SPONSORSHIP_SECONDS + 60) * 1000;
const pendingKey = (account: Address, networkId: string) =>
  `gatopago.pending.${networkId}.${account.toLowerCase()}`;

function remember(account: Address, networkId: string, pending: Pending) {
  try {
    localStorage.setItem(pendingKey(account, networkId), JSON.stringify(pending));
  } catch {
    // Without storage the operation is still awaited; only a reload loses track of it.
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
 * Settles the last operation sent from this browser on `networkId` before another one: included
 * (the account's nonce moved past it) means it went through, so the new attempt stops and the
 * person checks it first; unknown but still valid means it may yet land; failed or expired means
 * nothing was paid.
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
    .catch((error: unknown) =>
      error instanceof UserOperationReceiptNotFoundError ? null : 'failed',
    );
  if (receipt === null) {
    if ((await account.getNonce({ key: 0n })) > BigInt(pending.nonce)) {
      forget(account.address, networkId);
      throw new Error('PREVIOUS_OPERATION_CONFIRMED');
    }
    if (Date.now() < pending.expiresAt) throw new Error('OPERATION_PENDING');
  } else if (receipt !== 'failed') {
    forget(account.address, networkId);
    invalidateActivity(token);
    if (receipt.success) throw new Error('PREVIOUS_OPERATION_CONFIRMED');
  }
  forget(account.address, networkId);
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
