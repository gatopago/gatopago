import {
  createPublicClient,
  fallback,
  http,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
} from 'viem';
import {
  createBundlerClient,
  createPaymasterClient,
  toWebAuthnAccount,
} from 'viem/account-abstraction';
import { walletContracts, walletNetwork } from '@gatopago/shared/networks';
import {
  REPLAYABLE_NONCE_KEY,
  encodeApplyApproval,
  gatopagoAccountAbi,
  toGatoPagoAccount,
} from '@gatopago/shared/wallet';
import type { ClientSettings } from '../lib/settings';
import { api, type Approvals } from './api';
import type { Session, Wallet } from './session';

export const USDC_DECIMALS = 6;

const clients = new Map<string, PublicClient<Transport, Chain>>();

/**
 * Reads go straight to the network: the configured RPC (`GATOPAGO_WALLET_RPC_URLS`), falling back
 * to the network's public one. Balances never depend on GatoPago.
 */
export function publicClient(settings: ClientSettings, networkId: string) {
  const url = settings.rpcUrls[networkId];
  const key = `${networkId} ${url ?? ''}`;
  let client = clients.get(key);
  if (!client) {
    client = createPublicClient({
      chain: walletNetwork(networkId).chain,
      transport: url ? fallback([http(url), http()]) : http(),
    });
    clients.set(key, client);
  }
  return client;
}

export function networkName(networkId: string): string {
  return walletNetwork(networkId).chain.name;
}

export function explorerUrl(networkId: string, hash: Hex): string | null {
  const explorer = walletNetwork(networkId).chain.blockExplorers?.default.url;
  return explorer ? `${explorer}/tx/${hash}` : null;
}

export function gatopagoAccount(settings: ClientSettings, wallet: Wallet, networkId: string) {
  return toGatoPagoAccount({
    client: publicClient(settings, networkId),
    owner: toWebAuthnAccount({
      credential: { id: wallet.credentialId, publicKey: wallet.publicKey },
    }),
    contracts: walletContracts,
    initialOwners: wallet.initialOwners,
  });
}

/**
 * Sends `calls` from the signed-in account on `networkId`, sponsored by GatoPago, after applying
 * the account's pending owner approvals there. Returns the transaction hash.
 */
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
  return receipt.transactionHash;
}

/**
 * Applies, in order, the stored approvals (owner changes) this network has not applied yet. They
 * are signed once for every network, so this sends them as they are, without another passkey prompt.
 */
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

/** How many approvals the account applied on `networkId`, or null where it is not deployed. */
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
