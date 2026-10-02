'use client';

import { useId } from 'react';
import type { TransferRequest } from '@gatopago/shared/v3/transfer';
import { parseAtomicAmount } from '@gatopago/shared/v3/primitives';
import { creationFeeUnit } from './creation-fee';
import { formatTransferAsset, validateTransferAssets, type TransferAsset } from './transfer-form';
import type { TransferSelection } from './transfer-preparation';
import { parseTransferStatus } from './transfers';

export type TransferReceiptProps = {
  readonly english: boolean;
  readonly request: TransferRequest;
  readonly selected: TransferSelection;
  readonly status: ReturnType<typeof parseTransferStatus>;
  /** Exact amount resolved by the verified review, including MAX. */
  readonly amountAtomic: string;
  readonly metadata: readonly TransferAsset[];
  readonly onClose?: () => void;
};

function getExplorerTxUrl(networkId: string, txHash: string): string | null {
  if (networkId === 'eip155:421614') return `https://sepolia.arbiscan.io/tx/${txHash}`;
  if (networkId === 'eip155:84532') return `https://sepolia.basescan.org/tx/${txHash}`;
  if (networkId === 'eip155:43113') return `https://testnet.snowtrace.io/tx/${txHash}`;
  return null;
}

/** Structured Consumer receipt showing final status, transaction hash, and reconciliation state.
 * CRITICAL: A reverted transfer is NEVER displayed as paid. */
export function TransferReceipt({ english: en, request, selected, status: input, amountAtomic, metadata, onClose }: TransferReceiptProps) {
  const heading = useId();
  if (request.wallet_id !== selected.wallet_id || request.network_id !== selected.network_id) throw new Error('Receipt context mismatch');
  const status = parseTransferStatus(input, { wallet_id: selected.wallet_id, wallet_account_id: selected.wallet_account_id,
    network_id: selected.network_id, operation_id: input.operation_id });
  const resolvedAmount = parseAtomicAmount(amountAtomic);
  if (resolvedAmount === '0' || (request.amount.kind === 'exact' && resolvedAmount !== request.amount.amount_atomic)) throw new Error('Receipt amount mismatch');
  const confirmation = status.historical_confirmation;
  const outcome = confirmation?.outcome;
  const assets = validateTransferAssets(metadata, request.network_id);
  const native = creationFeeUnit(request.network_id);
  const amount = formatTransferAsset(resolvedAmount, request.asset_id, assets);
  const explorerUrl = confirmation?.transaction_hash ? getExplorerTxUrl(request.network_id, confirmation.transaction_hash) : null;

  const isReverted = outcome === 'execution_reverted';
  const isSucceeded = outcome === 'execution_succeeded';
  const isReviewRequired = status.status === 'review_required';
  const isExpired = status.status === 'expired', isHeld = status.status === 'held';
  const canClose = !status.funds_reserved && (status.status === 'reconciled' || isExpired);

  return (
    <article aria-labelledby={heading} className="auth-panel" role="region">
      <header>
        <h3 id={heading}>
          {isReviewRequired ? (en ? 'Transfer in review' : 'Envío en revisión')
            : isExpired ? (en ? 'Sending window expired' : 'Venció el plazo de envío')
              : isSucceeded ? status.status === 'reconciled'
                ? (en ? 'Transfer completed' : 'Envío completado') : (en ? 'Transfer confirmed' : 'Envío confirmado')
                : isReverted ? (en ? 'Execution reverted' : 'Ejecución revertida')
                  : isHeld ? (en ? 'Transfer reserved' : 'Envío reservado') : (en ? 'Transfer pending' : 'Envío en proceso')}
        </h3>
        <p role="status">
          {isReviewRequired
            ? (en ? 'Conflicting transaction evidence was found. Do not create a duplicate transfer.' : 'Se registró evidencia contradictoria. No crees un envío duplicado.')
            : isExpired ? (en ? 'The sending window expired and the reservation was released. No execution was confirmed.' : 'Venció el plazo de envío y se liberó la reserva. No se confirmó una ejecución.')
              : isSucceeded ? (en ? 'Transaction included onchain and execution succeeded.' : 'Transacción confirmada en cadena con ejecución exitosa.')
                : isReverted ? (en ? 'Execution reverted onchain. Funds were NOT delivered to the recipient.' : 'La ejecución revirtió en la red. Los fondos NO fueron entregados al destinatario.')
                  : isHeld ? (en ? 'Funds are reserved. This transfer has not been submitted.' : 'Los fondos están reservados. Este envío aún no fue presentado.')
                    : (en ? 'Transaction is waiting for block inclusion and finality.' : 'La transacción está esperando inclusión en bloque y finalidad.')}
        </p>
      </header>

      {status.status === 'reconciled' ? (
        <p className="auth-local" role="status">
          {en ? 'Balance reconciled; reserved funds released.' : 'Saldo reconciliado; reserva de fondos liberada.'}
        </p>
      ) : status.funds_reserved && !isHeld ? (
        <p role="status">
          {en ? 'Funds remain reserved while finality is observed.' : 'Los fondos siguen reservados mientras se observa la finalidad.'}
        </p>
      ) : null}

      <dl>
        <dt>{en ? 'Recipient' : 'Destino'}</dt>
        <dd style={{ overflowWrap: 'anywhere' }}>{request.destination.address}</dd>

        <dt>{en ? 'Amount' : 'Importe'}</dt>
        <dd>{amount}{request.amount.kind === 'max' ? ' (MAX)' : ''}</dd>

        <dt>{en ? 'Network' : 'Red'}</dt>
        <dd>{native?.network ?? request.network_id}</dd>

        <dt>{en ? 'Sender account' : 'Cuenta de origen'}</dt>
        <dd style={{ overflowWrap: 'anywhere' }}>{selected.address || selected.wallet_account_id}</dd>

        {confirmation?.transaction_hash ? (
          <>
            <dt>{en ? 'Transaction hash' : 'Hash de transacción'}</dt>
            <dd style={{ overflowWrap: 'anywhere' }}>
              <code>{confirmation.transaction_hash}</code>
              {explorerUrl ? (
                <div>
                  <a href={explorerUrl} target="_blank" rel="noopener noreferrer">
                    {en ? 'View in explorer ↗' : 'Ver en explorador ↗'}
                  </a>
                </div>
              ) : null}
            </dd>
          </>
        ) : null}

        <dt>{en ? 'Operation reference' : 'Referencia de operación'}</dt>
        <dd style={{ overflowWrap: 'anywhere' }}>{status.operation_id}</dd>

        <dt>{en ? 'UserOp hash' : 'Hash de UserOp'}</dt>
        <dd style={{ overflowWrap: 'anywhere' }}>
          <code>{status.userop_hash}</code>
        </dd>
      </dl>

      {onClose && canClose ? (
        <button type="button" className="auth-primary btn btn-primary btn-block" onClick={onClose}>
          {en ? 'Done' : 'Listo'}
        </button>
      ) : null}
    </article>
  );
}
