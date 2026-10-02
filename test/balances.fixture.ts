import { createResourceId } from '@gatopago/shared/v3/primitives';
import type { AccountChoice } from '../src/wallet/balances';

export function balanceFixture(now = Math.floor(Date.now() / 1000)) {
  const account: AccountChoice = { id: createResourceId('walletAccount'), wallet_id: createResourceId('wallet'), network_id: 'eip155:84532' };
  const checkpoint = { block_number: '100', block_hash: `0x${'aa'.repeat(32)}`, block_timestamp: String(now - 20) };
  const wire = { network_id: account.network_id, address: `0x${'cc'.repeat(20)}`, checkpoint,
    balances: [{ asset_id: 'eip155:84532/slip44:60', amount_atomic: '0', decimals: 18, symbol: 'ETH' },
      { asset_id: `eip155:84532/erc20:0x${'dd'.repeat(20)}`, amount_atomic: '12345987654', decimals: 6, symbol: 'USDC' }],
    observed_at: now, expires_at: now + 30, finality: 'finalized', spend_readiness: 'not_assessed', available_balance: 'not_assessed',
    wallet_id: account.wallet_id, wallet_account_id: account.id,
    finality_evidence: { schema_version: 1, status: 'finalized', policy_sha256: `0x${'bb'.repeat(32)}`, mechanism: 'op_stack_l1_data_finalized',
      network_id: account.network_id, genesis_hash: `0x${'ee'.repeat(32)}`, target: { ...checkpoint }, checkpoint: { ...checkpoint }, assessed_at: now, expires_at: now + 30 } };
  return { account, wire, now };
}
