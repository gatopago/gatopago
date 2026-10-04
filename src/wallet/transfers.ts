import { parseNetworkId, parseResourceId } from '@gatopago/shared/v3/primitives';
import type { EnabledAuthConfig } from '../auth/config';
import { exact, record, walletTransport, WalletCoreError } from './http';

export interface TransferLocator {
  wallet_id: string;
  wallet_account_id: string;
  operation_id: string;
  network_id: string;
}
const statuses = [
  'held',
  'expired',
  'delivery_pending',
  'confirmation_recorded',
  'review_required',
  'reconciled',
] as const;
const fail = () => new WalletCoreError('wallet/unavailable');
const hash = (value: unknown): value is string =>
  typeof value === 'string' && /^0x[0-9a-f]{64}$(?![\s\S])/.test(value) && !/^0x0+$/.test(value);

/** Historical display contract, never a send grant or an available balance. */
export function parseTransferStatus(
  input: unknown,
  selected: TransferLocator,
  now = Math.floor(Date.now() / 1000),
) {
  if (
    !record(input) ||
    !exact(input, [
      'operation_id',
      'wallet_id',
      'wallet_account_id',
      'network_id',
      'userop_hash',
      'status',
      'historical_confirmation',
      'settlement',
      'send_enabled',
      'funds_reserved',
    ]) ||
    input.operation_id !== selected.operation_id ||
    input.wallet_id !== selected.wallet_id ||
    input.wallet_account_id !== selected.wallet_account_id ||
    input.network_id !== selected.network_id ||
    !hash(input.userop_hash) ||
    input.settlement !== 'not_assessed' ||
    input.send_enabled !== false
  )
    throw fail();
  const status = statuses.find((s) => s === input.status);
  if (!status) throw fail();
  if (input.funds_reserved !== (status !== 'expired' && status !== 'reconciled')) throw fail();
  const historical = input.historical_confirmation;
  let confirmation: {
    transaction_hash: string;
    outcome: 'execution_succeeded' | 'execution_reverted';
    recorded_at: number;
  } | null = null;
  if (
    status === 'confirmation_recorded' ||
    status === 'review_required' ||
    status === 'reconciled'
  ) {
    if (
      !record(historical) ||
      !exact(historical, ['transaction_hash', 'outcome', 'recorded_at']) ||
      !hash(historical.transaction_hash) ||
      (historical.outcome !== 'execution_succeeded' &&
        historical.outcome !== 'execution_reverted') ||
      typeof historical.recorded_at !== 'number' ||
      !Number.isSafeInteger(historical.recorded_at) ||
      historical.recorded_at < 1 ||
      historical.recorded_at > now
    )
      throw fail();
    confirmation = {
      transaction_hash: historical.transaction_hash,
      outcome: historical.outcome,
      recorded_at: historical.recorded_at,
    };
  } else if (historical !== null) throw fail();
  return Object.freeze({
    ...selected,
    userop_hash: input.userop_hash,
    status,
    historical_confirmation: confirmation,
    funds_reserved: input.funds_reserved,
    settlement: 'not_assessed' as const,
    send_enabled: false as const,
  });
}

export function transferClient(config: EnabledAuthConfig, token: () => Promise<string>) {
  return {
    async status(selected: TransferLocator, signal: AbortSignal) {
      // Snapshot selection before token acquisition / network awaits.
      const expected = {
        wallet_id: parseResourceId('wallet', selected.wallet_id),
        wallet_account_id: parseResourceId('walletAccount', selected.wallet_account_id),
        operation_id: parseResourceId('operation', selected.operation_id),
        network_id: parseNetworkId(selected.network_id),
      };
      const result = await walletTransport(config, token, signal).request(
        `/wallets/${expected.wallet_id}/accounts/${expected.wallet_account_id}/transfers/${expected.operation_id}`,
        'GET',
      );
      if (result.status !== 200) throw fail();
      return parseTransferStatus(result.value, expected);
    },
  };
}
