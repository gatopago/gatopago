import { getAddress, isAddress } from 'viem';
import { atomicToDecimal, decimalToAtomic } from '@gatopago/shared/v3/amount';
import { CLIENT_RELEASE_ID } from '@gatopago/shared/v3/client-release';
import { parseEvmAssetId, parseNetworkId, parseResourceId } from '@gatopago/shared/v3/primitives';
import { parseTransferRequest } from '@gatopago/shared/v3/transfer';
import type { TransferSelection } from './transfer-preparation';
import type { BalanceView } from './balances';

export type TransferAsset = Readonly<{ asset_id: string; decimals: number; symbol: string }>;

export function transferAssets(
  balance: BalanceView,
  selected: TransferSelection,
): readonly TransferAsset[] {
  if (
    balance.account.wallet_id !== selected.wallet_id ||
    balance.account.id !== selected.wallet_account_id ||
    balance.account.network_id !== selected.network_id ||
    getAddress(balance.address) !== getAddress(selected.address)
  )
    throw new Error('Transfer asset context mismatch');
  return validateTransferAssets(balance.assets, selected.network_id);
}
export function validateTransferAssets(
  input: readonly TransferAsset[],
  network: string,
): readonly TransferAsset[] {
  parseNetworkId(network);
  if (!Array.isArray(input) || !input.length || input.length > 16)
    throw new Error('Invalid transfer assets');
  const assets = input.map((a) => {
    const asset_id = parseEvmAssetId(a.asset_id);
    if (
      !asset_id.startsWith(`${network}/`) ||
      !/\/(slip44:|erc20:)/.test(asset_id) ||
      !Number.isInteger(a.decimals) ||
      a.decimals < 0 ||
      a.decimals > 255 ||
      typeof a.symbol !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,15}$(?![\s\S])/.test(a.symbol)
    )
      throw new Error('Invalid transfer asset');
    return Object.freeze({ asset_id, decimals: a.decimals, symbol: a.symbol });
  });
  if (
    new Set(assets.map((a) => a.asset_id)).size !== assets.length ||
    assets.filter((a) => a.asset_id.includes('/slip44:')).length !== 1
  )
    throw new Error('Invalid transfer asset registry');
  return Object.freeze(assets);
}
export function formatTransferAsset(
  amount: string,
  assetId: string,
  assets: readonly TransferAsset[],
) {
  const asset = assets.find((a) => a.asset_id === assetId);
  if (!asset) throw new Error('Missing transfer asset metadata');
  return `${atomicToDecimal(amount, asset.decimals)} ${asset.symbol}`;
}
export function transferFormRequest(
  selected: TransferSelection,
  metadata: readonly TransferAsset[],
  input: {
    asset_id: string;
    destination: string;
    amount: string;
    max: boolean;
  },
) {
  const assets = validateTransferAssets(metadata, selected.network_id),
    asset = assets.find((a) => a.asset_id === input.asset_id);
  if (
    !asset ||
    typeof input.max !== 'boolean' ||
    typeof input.destination !== 'string' ||
    input.destination.length !== 42 ||
    !isAddress(input.destination, { strict: true })
  )
    throw new Error('Invalid transfer form');
  return parseTransferRequest({
    schema_version: 1,
    generation: 3,
    wallet_id: parseResourceId('wallet', selected.wallet_id),
    network_id: selected.network_id,
    asset_id: asset.asset_id,
    client_release_id: CLIENT_RELEASE_ID,
    destination: {
      address: getAddress(input.destination).toLowerCase(),
      address_type: 'evm_unknown',
    },
    amount: input.max
      ? { kind: 'max' }
      : { kind: 'exact', amount_atomic: decimalToAtomic(input.amount, asset.decimals) },
  });
}
