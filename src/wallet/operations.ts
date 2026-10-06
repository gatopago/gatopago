import { http, type Address, type Hex } from 'viem';
import { createBundlerClient, createPaymasterClient } from 'viem/account-abstraction';
import {
  REPLAYABLE_NONCE_KEY,
  encodeApplyApproval,
  gatopagoAccountAbi,
} from '@gatopago/shared/wallet';
import type { ClientSettings } from '../lib/settings';
import { gatopagoAccount, publicClient } from './account';
import { invalidateActivity } from './activity';
import { api, type Approvals } from './api';
import type { Session } from './session';

/** Sends sponsored calls after applying the account's pending owner approvals. */
export async function send(
  settings: ClientSettings,
  session: Session,
  networkId: string,
  calls: readonly { to: Address; data: Hex; value?: bigint }[],
): Promise<Hex> {
  const account = await gatopagoAccount(settings, session.wallet, networkId);
  const bundler = bundlerClient(settings, session, networkId, account);
  await applyApprovals(settings, session, networkId, account, bundler);
  const hash = await bundler.sendUserOperation({ calls });
  const { receipt, success } = await bundler.waitForUserOperationReceipt({ hash });
  if (!success) throw new Error('OPERATION_REVERTED');
  invalidateActivity(session.token);
  return receipt.transactionHash;
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
