import type { Environment } from '@gatopago/environment';
import { loadAaveMarket, type AaveMarketPin } from '@gatopago/shared/v3/aave-market';
import { loadPinnedDeploymentManifest } from '@gatopago/shared/v3/deployment';
import type { MoneyKind } from '@gatopago/shared/v3/money-wire';
import type { TransferSelection } from './transfer-preparation';
import configuration from '../../config/money-release.json';

export type MoneySelection = TransferSelection & { market: AaveMarketPin; gas: typeof configuration.gas };
/** Generated reviewed release, never a target or fee ceiling chosen by HTTP. */
export function moneySelectionForRelease(selected: TransferSelection, environment: Environment): MoneySelection {
  const captured = structuredClone(selected), manifest = loadPinnedDeploymentManifest(captured.deployment.document, captured.deployment.digest as `0x${string}`);
  const market: AaveMarketPin = { ...configuration.market, digest: configuration.market.digest as `0x${string}` };
  const admitted = loadAaveMarket(market);
  if (configuration.schema_version !== 1 || configuration.gas.money_schema_version !== 1
    || !environment.wallet_enabled.includes('eip155:421614') || captured.network_id !== 'eip155:421614'
    || manifest.network_id !== captured.network_id || manifest.generation !== 3 || manifest.lifecycle_status !== 'deployed'
    || configuration.gas.deployment_sha256 !== captured.deployment.digest || configuration.gas.market_sha256 !== market.digest
    || admitted.genesis_hash !== manifest.genesis_hash) throw new Error('MONEY_RELEASE_UNAVAILABLE');
  return Object.freeze({ ...captured, market, gas: structuredClone(configuration.gas) });
}
export function assertMoneyGas(selected: MoneySelection, kind: MoneyKind, gas: Record<string, bigint>, now: number) {
  const expected = selected.gas.limits[kind];
  if (now < selected.gas.valid_from || now >= selected.gas.valid_until || Object.entries(expected).some(([key, value]) => gas[key]?.toString() !== value)) {
    throw new Error('MONEY_GAS_RELEASE_MISMATCH');
  }
}
