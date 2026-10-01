import { isAddress } from 'viem';
import { assertFinalityAssessment } from '@gatopago/shared/v3/finality';
import { parseAtomicAmount, parseEvmAssetId, parseNetworkId, parseResourceId } from '@gatopago/shared/v3/primitives';
import type { EnabledAuthConfig } from '../auth/config';
import { exact, record, walletTransport, WalletCoreError } from './http';

export type AccountChoice = { id: string; wallet_id: string; network_id: string };
export type AccountPage = { data: AccountChoice[]; next_cursor: string | null };
export type BalanceView = { account: AccountChoice; address: string; observed_at: number; expires_at: number;
  block_number: string; block_hash: string; assets: { asset_id: string; amount_atomic: string; decimals: number; symbol: string }[] };
const fail = () => new WalletCoreError('wallet/unavailable');
const hash = (value: unknown): value is `0x${string}` => typeof value === 'string' && /^0x[0-9a-f]{64}$(?![\s\S])/.test(value);

function accounts(input: unknown, walletId: string, after: string | null): AccountPage {
  if (!record(input) || !exact(input, ['data', 'next_cursor']) || !Array.isArray(input.data) || input.data.length > 20) throw fail();
  const data = input.data.map((row): AccountChoice => {
    if (!record(row) || !exact(row, ['id','wallet_id','network_id','generation','deployment_state','spend_readiness','receive_enabled'])
      || row.wallet_id !== walletId || row.generation !== 3 || row.spend_readiness !== 'not_assessed' || row.receive_enabled !== false
      || !['counterfactual','deploying','active','needs_security_sync','unsupported','retired'].includes(String(row.deployment_state))) throw fail();
    return { id: parseResourceId('walletAccount', row.id), wallet_id: walletId, network_id: parseNetworkId(row.network_id) };
  });
  if (data.some((row, i) => row.id <= (i ? data[i - 1].id : after ?? ''))) throw fail();
  const cursor = input.next_cursor === null ? null : parseResourceId('walletAccount', input.next_cursor);
  if (cursor !== null && (data.length !== 20 || cursor !== data.at(-1)?.id)) throw fail();
  return { data, next_cursor: cursor };
}

/** Display-only parser. Finality is asserted by Wallet Core, not a browser light client.
 * Never turn this response into receive/spend permission or a transfer budget.
 */
export function parseBalanceView(input: unknown, selected: AccountChoice, now = Math.floor(Date.now() / 1000)): BalanceView {
  if (!record(input) || !exact(input, ['network_id','address','checkpoint','balances','observed_at','finality','spend_readiness',
    'wallet_id','wallet_account_id','finality_evidence','expires_at','available_balance'])
    || input.wallet_id !== selected.wallet_id || input.wallet_account_id !== selected.id || input.network_id !== selected.network_id
    || input.finality !== 'finalized' || input.spend_readiness !== 'not_assessed' || input.available_balance !== 'not_assessed'
    || typeof input.address !== 'string' || !isAddress(input.address) || !record(input.checkpoint)
    || !exact(input.checkpoint, ['block_number','block_hash','block_timestamp']) || !hash(input.checkpoint.block_hash)
    || typeof input.observed_at !== 'number' || !Number.isSafeInteger(input.observed_at) || input.observed_at > now || input.observed_at < 1
    || typeof input.expires_at !== 'number' || !Number.isSafeInteger(input.expires_at) || input.expires_at <= now
    || input.expires_at > input.observed_at + 60 || !Array.isArray(input.balances) || !input.balances.length || input.balances.length > 16) throw fail();
  const blockNumber = parseAtomicAmount(input.checkpoint.block_number), timestamp = parseAtomicAmount(input.checkpoint.block_timestamp);
  const evidence = input.finality_evidence;
  if (!record(evidence) || !hash(evidence.genesis_hash)) throw fail();
  assertFinalityAssessment(evidence, { network_id: parseNetworkId(selected.network_id), genesis_hash: evidence.genesis_hash,
    block_hash: input.checkpoint.block_hash, block_number: blockNumber, block_timestamp: timestamp });
  if (evidence.status !== 'finalized' || input.expires_at > evidence.expires_at || evidence.assessed_at > now
    || evidence.assessed_at < input.observed_at) throw fail();
  const assets = input.balances.map((row) => {
    if (!record(row) || !exact(row, ['asset_id','amount_atomic','decimals','symbol']) || typeof row.decimals !== 'number'
      || !Number.isInteger(row.decimals) || row.decimals < 0 || row.decimals > 255 || typeof row.symbol !== 'string'
      || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,15}$(?![\s\S])/.test(row.symbol)) throw fail();
    const asset = parseEvmAssetId(row.asset_id);
    if (!asset.startsWith(`${selected.network_id}/`) || !/\/(slip44:|erc20:)/.test(asset)) throw fail();
    return { asset_id: asset, amount_atomic: parseAtomicAmount(row.amount_atomic), decimals: row.decimals, symbol: row.symbol };
  });
  if (new Set(assets.map((asset) => asset.asset_id)).size !== assets.length) throw fail();
  return { account: { ...selected }, address: input.address, observed_at: input.observed_at, expires_at: input.expires_at,
    block_number: blockNumber, block_hash: input.checkpoint.block_hash, assets };
}

export function balanceClient(config: EnabledAuthConfig, token: () => Promise<string>) {
  return {
    async accounts(wallet: string, after: string | null, signal: AbortSignal): Promise<AccountPage> {
      const id = parseResourceId('wallet', wallet), cursor = after === null ? '' : `&after=${parseResourceId('walletAccount', after)}`;
      const result = await walletTransport(config, token, signal).request(`/wallets/${id}/accounts?limit=20${cursor}`, 'GET');
      if (result.status !== 200) throw fail(); return accounts(result.value, id, after);
    },
    async read(selected: AccountChoice, signal: AbortSignal): Promise<BalanceView> {
      const expected = { id: parseResourceId('walletAccount', selected.id), wallet_id: parseResourceId('wallet', selected.wallet_id), network_id: parseNetworkId(selected.network_id) };
      const result = await walletTransport(config, token, signal).request(`/wallets/${expected.wallet_id}/accounts/${expected.id}/balances`, 'GET');
      if (result.status !== 200) throw fail(); return parseBalanceView(result.value, expected);
    },
  };
}
