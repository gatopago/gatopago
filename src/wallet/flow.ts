import {
  createWalletClient,
  custom,
  erc20Abi,
  parseUnits,
  type Address,
  type EIP1193Provider,
  type Hex,
} from 'viem';
import { walletNetwork } from '@gatopago/shared/networks';
import { paymentCalls, paymentRouterAbi, type Payment } from '@gatopago/shared/payments';
import type { ClientSettings } from '../lib/settings';
import { publicClient, send } from './account';
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

export const readCheckout = (settings: ClientSettings, id: string) =>
  api<Intent>(settings.apiOrigin, `/checkout/v1/${id}`);

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

const confirm = (settings: ClientSettings, id: string, network: string, hash: Hex) =>
  api<Intent>(settings.apiOrigin, `/checkout/v1/${id}/confirm`, {
    body: { network, transaction_hash: hash },
  });

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
  const calls = paymentCalls(walletNetwork(plan.network), plan.payment, plan.signature);
  return confirm(
    settings,
    intent.id,
    plan.network,
    await send(settings, session, plan.network, calls),
  );
}

/** Pays from a browser wallet (EIP-1193): approve, then pay, on `network`. */
export async function payWithBrowserWallet(
  settings: ClientSettings,
  intent: Intent,
  network: string,
) {
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
  const approval = await wallet.writeContract({
    account: payer,
    address: usdc,
    abi: erc20Abi,
    functionName: 'approve',
    args: [walletNetwork(network).paymentRouter, plan.total],
  });
  await client.waitForTransactionReceipt({ hash: approval });
  const hash = await wallet.writeContract({
    account: payer,
    address: walletNetwork(network).paymentRouter,
    abi: paymentRouterAbi,
    functionName: 'pay',
    args: [plan.payment, plan.signature],
  });
  await client.waitForTransactionReceipt({ hash });
  return confirm(settings, intent.id, network, hash);
}

/** A charge: the member's own Flow payment intent, created with their session. */
export const createCharge = (
  settings: ClientSettings,
  session: Session,
  charge: { amount: string; description?: string },
) => flowApi<Intent>(settings, session, 'payment_intents', { body: charge });

/** The member's latest charges (Flow keeps 100), newest first. */
export const listCharges = (settings: ClientSettings, session: Session, signal?: AbortSignal) =>
  flowApi<{ data: Intent[] }>(settings, session, 'payment_intents', { signal }).then(
    ({ data }) => data,
  );

/** A request to GatoPago Flow's merchant API (`/v1/...`) with the member's session. */
export const flowApi = <T>(
  settings: ClientSettings,
  session: Session,
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {},
) => api<T>(settings.apiOrigin, `/v1/${path}`, { ...init, token: session.token });
