import {
  createPublicClient,
  fallback,
  http,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
} from 'viem';
import { toWebAuthnAccount } from 'viem/account-abstraction';
import { walletContracts, walletNetwork } from '@gatopago/shared/networks';
import { toGatoPagoAccount } from '@gatopago/shared/wallet';
import type { ClientSettings } from '../lib/settings';
import type { Wallet } from './session';

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
