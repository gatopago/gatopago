import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { deploymentDocumentDigest } from '@gatopago/shared/v3/deployment';
import { parseMoneyStatus } from '../src/wallet/money';
import { MoneyOperationReceipt } from '../src/wallet/MoneyOperationReceipt';
import { moneyFixture } from './money.fixture';

afterEach(() => vi.restoreAllMocks());
function fixture() {
  const f = moneyFixture(), c = f.candidate;
  vi.spyOn(Date, 'now').mockReturnValue((c.plan.validUntil + 10) * 1000);
  const receipt = { schema_version: 1, money_schema_version: 1, network_id: c.request.network_id, market_id: c.request.market_id,
    market_sha256: f.selection.market.digest, deployment_sha256: c.deployment_digest, userop_hash: c.userOpHash, consent_digest: c.digest,
    transaction_hash: `0x${'22'.repeat(32)}`, block_hash: `0x${'33'.repeat(32)}`, block_number: '100', block_timestamp: String(f.now),
    transaction_index: '0', kind: c.request.kind, amount_atomic: c.request.amount_atomic, recipient_address: null,
    outcome: 'outer_transaction_reverted', actual_gas_cost: '0', actual_gas_used: '0', finality: 'not_assessed', settlement: 'not_assessed',
    log_indexes: { operation: null, calls: null, pool: null, transfers: [], approvals: [] },
    outer_transaction: { operator: `0x${'66'.repeat(20)}`, nonce: '7', gas_used: '1000', effective_gas_price_atomic: '10', gas_used_for_l1: '200', gas_cost_atomic: '10000' },
    nonexecution: { nonce: c.plan.nonce.toString(), valid_until: c.plan.validUntil,
      checkpoint: { block_number: '130', block_hash: `0x${'44'.repeat(32)}`, block_timestamp: String(c.plan.validUntil + 1) } } };
  const status = { ...f.status, state: 'reverted_confirmed', settlement: 'reverted_confirmed', funds_reserved: false,
    dispatched_at: f.now, receipt, receipt_sha256: deploymentDocumentDigest(JSON.stringify(receipt)) };
  return { ...f, receipt, status,
    parsed: () => parseMoneyStatus({ ...status, receipt_sha256: deploymentDocumentDigest(JSON.stringify(receipt)) }, f.selection, f.environment, f.operationId) };
}
describe('Browser classification of finalized outer failure', () => {
  it.each([false, true])('shows nonexecution and operator-paid gas without charging the account; English=%s', english => {
    const f = fixture(), status = f.parsed(), html = renderToStaticMarkup(createElement(MoneyOperationReceipt, { status, english }));
    expect(status.receipt).toMatchObject({ outcome: 'outer_transaction_reverted', actual_gas_cost: '0', operator_gas_cost: '10000' });
    expect(html).toContain(english ? 'your account paid no gas' : 'tu cuenta no pagó gas');
    expect(html).toContain(english ? 'Gas paid by the operator' : 'Gas pagado por el operador');
  });
  it.each(['charged-account', 'consumed-nonce', 'at-expiry', 'wrong-window', 'old-checkpoint', 'future-checkpoint', 'wrong-cost', 'excess-l1', 'inner-event', 'extra-field', 'false-success'])(
    'rejects inconsistent %s evidence', fault => {
      const f = fixture();
      if (fault === 'charged-account') f.receipt.actual_gas_cost = '1';
      if (fault === 'consumed-nonce') f.receipt.nonexecution.nonce = '1';
      if (fault === 'at-expiry') f.receipt.nonexecution.checkpoint.block_timestamp = String(f.candidate.plan.validUntil);
      if (fault === 'wrong-window') f.receipt.nonexecution.valid_until++;
      if (fault === 'old-checkpoint') f.receipt.nonexecution.checkpoint.block_number = '99';
      if (fault === 'future-checkpoint') f.receipt.nonexecution.checkpoint.block_timestamp = String(f.candidate.plan.validUntil + 11);
      if (fault === 'wrong-cost') f.receipt.outer_transaction.gas_cost_atomic = '10001';
      if (fault === 'excess-l1') f.receipt.outer_transaction.gas_used_for_l1 = '1001';
      if (fault === 'inner-event') Reflect.set(f.receipt.log_indexes, 'operation', '1');
      if (fault === 'extra-field') Object.assign(f.receipt, { send_enabled: true });
      if (fault === 'false-success') Object.assign(f.status, { state: 'reconciled', settlement: 'reconciled' });
      expect(f.parsed).toThrow();
    });
});
