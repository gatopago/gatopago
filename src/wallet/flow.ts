import {
  BaseError,
  createWalletClient,
  custom,
  erc20Abi,
  parseUnits,
  UserRejectedRequestError,
  type Address,
  type EIP1193Provider,
  type Hex,
} from 'viem';
import { walletNetwork } from '@gatopago/shared/networks';
import {
  paymentCalls,
  paymentPermit,
  paymentRouterAbi,
  payWithPermitCall,
  type Payment,
} from '@gatopago/shared/payments';
import type { ClientSettings } from '../lib/settings';
import { publicClient } from './account';
import { api } from './api';
import type { Session } from './session';

/** A GatoPago Flow payment intent, as its checkout shows it. */
export interface Intent {
  id: string;
  amount: string;
  status: 'requires_payment' | 'processing' | 'succeeded' | 'canceled' | 'expired';
  description: string | null;
  checkout_url: string;
  expires_at: number;
  created_at: number;
  payment: {
    network: string;
    transaction_hash: Hex | null;
    payer: Address | null;
    paid_at: number | null;
  } | null;
  merchant?: { name: string | null; address: Address };
}

/** Flow's authorization to pay an intent from `network`, and the USDC it costs there. */
export interface Plan {
  network: string;
  total: bigint;
  payment: Payment;
  signature: Hex;
}

export const readCheckout = (settings: ClientSettings, id: string, signal?: AbortSignal) =>
  api<Intent>(settings.apiOrigin, `/checkout/v1/${id}`, { signal });

async function authorize(settings: ClientSettings, id: string, payer: Address, network: string) {
  const authorization = await api<{
    total: string;
    payment: Record<string, string | number>;
    signature: Hex;
  }>(settings.apiOrigin, `/checkout/v1/${id}/authorize`, { body: { payer, network } });
  const { payment } = authorization;
  return {
    network,
    total: parseUnits(authorization.total, 6),
    signature: authorization.signature,
    payment: {
      ...(payment as unknown as Payment),
      amount: BigInt(payment.amount),
      fee: BigInt(payment.fee),
      maxCctpFee: BigInt(payment.maxCctpFee),
    },
  } satisfies Plan;
}

/**
 * A payment of an intent sent from this browser, kept until Flow registers it: a retry registers
 * that same transaction instead of paying again.
 */
const sentKey = (id: string) => `gatopago.checkout.sent.${id}`;

function sentPayment(id: string): { network: string; hash: Hex } | null {
  try {
    return JSON.parse(localStorage.getItem(sentKey(id)) ?? 'null');
  } catch {
    return null;
  }
}

/**
 * Keeps the transaction that pays `id` as soon as there is a hash: if waiting for it or telling Flow
 * fails, a retry (even after reloading) follows that same transaction instead of paying again.
 */
function rememberPayment(id: string, network: string, hash: Hex) {
  try {
    localStorage.setItem(sentKey(id), JSON.stringify({ network, hash }));
  } catch {
    // Without storage a retry pays again, and the router refuses a second payment of the intent.
  }
}

/** Tells Flow about the transaction that paid `id` (`PAYMENT_NOT_REGISTERED` until it answers). */
async function confirm(settings: ClientSettings, id: string, network: string, hash: Hex) {
  rememberPayment(id, network, hash);
  const intent = await api<Intent>(settings.apiOrigin, `/checkout/v1/${id}/confirm`, {
    body: { network, transaction_hash: hash },
  }).catch((error: unknown) => {
    throw new Error('PAYMENT_NOT_REGISTERED', { cause: error });
  });
  forgetPayment(id);
  return intent;
}

function forgetPayment(id: string) {
  try {
    localStorage.removeItem(sentKey(id));
  } catch {
    // Nothing stored.
  }
}

/**
 * Follows a browser wallet's transaction to its end: still pending or unreadable is
 * `PAYMENT_PENDING` and keeps it for the retry; a revert forgets it, so paying again is possible.
 */
async function settle(settings: ClientSettings, id: string, network: string, hash: Hex) {
  const receipt = await publicClient(settings, network)
    .waitForTransactionReceipt({ hash })
    .catch((error: unknown) => {
      throw new Error('PAYMENT_PENDING', { cause: error });
    });
  if (receipt.status === 'reverted') {
    forgetPayment(id);
    throw new Error('PAYMENT_REVERTED');
  }
  return confirm(settings, id, network, hash);
}

/**
 * How the GatoPago account pays `intent`: from the home network when it holds the total, otherwise
 * from the network holding the most (the router crosses to the merchant with CCTP).
 */
export async function planAccountPayment(
  settings: ClientSettings,
  session: Session,
  intent: Intent,
  balances: Record<string, bigint | null>,
): Promise<Plan> {
  const amount = parseUnits(intent.amount, 6);
  const networks = [
    settings.homeNetwork,
    ...settings.networks
      .filter((id) => id !== settings.homeNetwork)
      .sort((a, b) => ((balances[b] ?? 0n) > (balances[a] ?? 0n) ? 1 : -1)),
  ];
  for (const network of networks) {
    if ((balances[network] ?? 0n) < amount) continue;
    const plan = await authorize(settings, intent.id, session.wallet.address, network);
    if ((balances[network] ?? 0n) >= plan.total) return plan;
  }
  throw new Error('INSUFFICIENT_FUNDS');
}

/** Approve and pay in one sponsored operation of the account. */
export async function payWithAccount(
  settings: ClientSettings,
  session: Session,
  intent: Intent,
  plan: Plan,
) {
  const sent = sentPayment(intent.id);
  if (sent) return confirm(settings, intent.id, sent.network, sent.hash);
  const calls = paymentCalls(walletNetwork(plan.network), plan.payment, plan.signature);
  // Signing loads on paying: the checkout page opens without it.
  const { send } = await import('./operations');
  return confirm(
    settings,
    intent.id,
    plan.network,
    await send(settings, session, plan.network, calls),
  );
}

/** How long a payment permit stays valid, in seconds: enough to confirm the transaction. */
const PERMIT_SECONDS = 1800n;

/**
 * Pays from a browser wallet (EIP-1193) on `network`: the wallet signs an EIP-2612 permit for
 * exactly the total (no gas) and pays in one transaction, leaving no allowance behind. A wallet
 * that cannot sign it approves and then pays, in two transactions. Rejecting the signature cancels.
 */
export async function payWithBrowserWallet(
  settings: ClientSettings,
  intent: Intent,
  network: string,
) {
  const sent = sentPayment(intent.id);
  if (sent) return settle(settings, intent.id, sent.network, sent.hash);
  const provider = (window as { ethereum?: EIP1193Provider }).ethereum;
  if (!provider) throw new Error('NO_BROWSER_WALLET');
  const { chain, usdc } = walletNetwork(network);
  const wallet = createWalletClient({ chain, transport: custom(provider) });
  const [payer] = await wallet.requestAddresses();
  await wallet.switchChain({ id: chain.id }).catch(async () => {
    await wallet.addChain({ chain });
    await wallet.switchChain({ id: chain.id });
  });
  const plan = await authorize(settings, intent.id, payer, network);
  const client = publicClient(settings, network);
  // Wallets may cap the fee right at the current base fee and fail as soon as it rises; this
  // allows it to double before inclusion (EIP-1559: only the actual fee is paid).
  const fees = async () => {
    const [block, tip] = await Promise.all([
      client.getBlock(),
      client.estimateMaxPriorityFeePerGas(),
    ]);
    return { maxFeePerGas: (block.baseFeePerGas ?? 0n) * 2n + tip, maxPriorityFeePerGas: tip };
  };
  const target = walletNetwork(network);
  const deadline = BigInt(Math.floor(Date.now() / 1000)) + PERMIT_SECONDS;
  const permit = await wallet
    .signTypedData({
      account: payer,
      ...(await paymentPermit(client, target, { owner: payer, value: plan.total, deadline })),
    })
    .catch((error: unknown) => {
      if (
        error instanceof BaseError &&
        error.walk((cause) => cause instanceof UserRejectedRequestError)
      )
        throw error;
      return null;
    });
  let hash: Hex;
  if (permit)
    hash = await wallet.sendTransaction({
      ...(await fees()),
      account: payer,
      ...payWithPermitCall(target, plan.payment, plan.signature, { deadline, signature: permit }),
    });
  else {
    const approval = await wallet.writeContract({
      ...(await fees()),
      account: payer,
      address: usdc,
      abi: erc20Abi,
      functionName: 'approve',
      args: [target.paymentRouter, plan.total],
    });
    await client.waitForTransactionReceipt({ hash: approval });
    hash = await wallet.writeContract({
      ...(await fees()),
      account: payer,
      address: target.paymentRouter,
      abi: paymentRouterAbi,
      functionName: 'pay',
      args: [plan.payment, plan.signature],
    });
  }
  rememberPayment(intent.id, network, hash);
  return settle(settings, intent.id, network, hash);
}

/**
 * A charge: the member's own Flow payment intent, created with their session. Retrying with the
 * same `key` returns the charge the first attempt created instead of a second one.
 */
export const createCharge = (
  settings: ClientSettings,
  session: Session,
  charge: { amount: string; description?: string },
  key: string,
) =>
  flowApi<Intent>(settings, session, 'payment_intents', {
    body: charge,
    headers: { 'Idempotency-Key': key },
  });

/** The member's latest charges (Flow keeps 100), newest first. */
export const listCharges = (settings: ClientSettings, session: Session, signal?: AbortSignal) =>
  flowApi<{ data: Intent[] }>(settings, session, 'payment_intents', { signal }).then(
    ({ data }) => data,
  );

/** A request to GatoPago Flow's merchant API (`/v1/...`) with the member's session. */
const flowApi = <T>(
  settings: ClientSettings,
  session: Session,
  path: string,
  init: {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
    headers?: Record<string, string>;
  } = {},
) => api<T>(settings.apiOrigin, `/v1/${path}`, { ...init, token: session.token });
