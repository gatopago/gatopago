'use client';

import { atomicToDecimal } from '@gatopago/shared/v3/amount';
import type { parseMoneyStatus } from './money';

export function MoneyOperationReceipt({
  status,
  english: en,
}: {
  status: ReturnType<typeof parseMoneyStatus>;
  english: boolean;
}) {
  const complete = status.state === 'reconciled',
    reverted = status.state === 'reverted_confirmed',
    expired = status.state === 'expired_unsubmitted';
  const outerRevert = status.receipt?.outcome === 'outer_transaction_reverted';
  return (
    <section
      className="money-panel money-receipt"
      aria-label={en ? 'Operation receipt' : 'Comprobante de operación'}
    >
      <p role="status">
        {complete
          ? en
            ? 'Confirmed and reconciled.'
            : 'Confirmada y conciliada.'
          : reverted
            ? outerRevert
              ? en
                ? 'Submission failed. The operation did not execute and your account paid no gas.'
                : 'El envío falló. La operación no se ejecutó y tu cuenta no pagó gas.'
              : en
                ? 'Execution reverted. Network gas was spent.'
                : 'La ejecución revirtió. Se consumió gas de red.'
            : expired
              ? en
                ? 'Expired without submission; the reservation was released.'
                : 'Venció sin enviarse; la reserva fue liberada.'
              : en
                ? 'The result is pending. Do not repeat this operation.'
                : 'El resultado está pendiente. No repitas esta operación.'}
      </p>
      <dl>
        <dt>{en ? 'Reference' : 'Referencia'}</dt>
        <dd className="break-all font-mono text-xs">{status.operation_id}</dd>
        <dt>{en ? 'Amount' : 'Importe'}</dt>
        <dd>{atomicToDecimal(status.candidate.request.amount_atomic, 6)} USDC</dd>
        <dt>{en ? 'Funds reservation' : 'Reserva de fondos'}</dt>
        <dd>
          {status.funds_reserved
            ? en
              ? 'Retained until the result is verified'
              : 'Retenida hasta verificar el resultado'
            : en
              ? 'Released'
              : 'Liberada'}
        </dd>
      </dl>
      {status.receipt ? (
        <dl>
          <dt>{en ? 'Transaction' : 'Transacción'}</dt>
          <dd className="break-all font-mono text-xs">{status.receipt.transaction_hash}</dd>
          <dt>{en ? 'Account gas cost' : 'Coste de gas de tu cuenta'}</dt>
          <dd>{atomicToDecimal(status.receipt.actual_gas_cost, 18)} ETH</dd>
          {status.receipt.operator_gas_cost !== null ? (
            <>
              <dt>{en ? 'Gas paid by the operator' : 'Gas pagado por el operador'}</dt>
              <dd>{atomicToDecimal(status.receipt.operator_gas_cost, 18)} ETH</dd>
            </>
          ) : null}
        </dl>
      ) : null}
      {status.evidence_conflict || status.state === 'review_required' ? (
        <p role="alert">
          {en
            ? 'This result needs further review. Funds remain reserved.'
            : 'Este resultado requiere revisión. Los fondos siguen reservados.'}
        </p>
      ) : null}
    </section>
  );
}
