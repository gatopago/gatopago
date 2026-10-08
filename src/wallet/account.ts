import {
  createPublicClient,
  fallback,
  http,
  type Chain,
  type PublicClient,
  type Transport,
} from 'viem';
import type { CctpNetwork } from '@gatopago/shared/crosschain';
import { stellarNetwork, walletContracts, walletNetwork } from '@gatopago/shared/networks';
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

/** Stellar ids (`stellar:…`) are not EVM wallet networks: no chain, contracts or bundler. */
export const isStellar = (networkId: string) => networkId.startsWith('stellar:');

/** Either side of a CCTP crossing: an EVM wallet network or Stellar. */
export const cctpNetwork = (networkId: string): CctpNetwork =>
  isStellar(networkId) ? stellarNetwork(networkId) : walletNetwork(networkId);

/** An address as people read it, by its ends: `0x1234…abcd` (a Stellar key too). */
export const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

export function networkName(networkId: string): string {
  return isStellar(networkId)
    ? stellarNetwork(networkId).name
    : walletNetwork(networkId).chain.name;
}

export function explorerUrl(networkId: string, hash: string): string | null {
  const explorer = isStellar(networkId)
    ? stellarNetwork(networkId).explorer
    : walletNetwork(networkId).chain.blockExplorers?.default.url;
  return explorer ? `${explorer}/tx/${hash}` : null;
}

/**
 * The account as viem sees it, signed by its passkey on the device or, for a Mera account, by the
 * open signing session (one passkey prompt when it has ended). The signing code loads only here:
 * screens that just read balances do not download it.
 */
export async function gatopagoAccount(settings: ClientSettings, wallet: Wallet, networkId: string) {
  const [{ toGatoPagoAccount }, owner] = await Promise.all([
    import('@gatopago/shared/wallet'),
    signer(settings, wallet),
  ]);
  return toGatoPagoAccount({
    client: publicClient(settings, networkId),
    owner,
    contracts: walletContracts,
    initialOwners: wallet.initialOwners,
  });
}

async function signer(settings: ClientSettings, wallet: Wallet) {
  if (wallet.meraOwner) {
    const { meraSigner } = await import('./mera');
    return meraSigner(settings, wallet.credentialId, wallet.meraOwner);
  }
  const { toWebAuthnAccount } = await import('viem/account-abstraction');
  return toWebAuthnAccount({
    credential: { id: wallet.credentialId, publicKey: wallet.publicKey },
  });
}
