'use client';

import { useId } from 'react';
import type { TransferRequest } from '@gatopago/shared/v3/transfer';
import { creationFeeUnit } from './creation-fee';
import { formatTransferAsset, validateTransferAssets, type TransferAsset } from './transfer-form';
import type { TransferSelection } from './transfer-preparation';
import type { parseTransferStatus } from './transfers';

export type TransferReceiptProps = {
  readonly english: boolean;
  readonly request: TransferRequest;
  readonly selected: TransferSelection;
  readonly status: ReturnType<typeof parseTransferStatus>;
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
export function TransferReceipt({ english: en, request, selected, status, metadata, onClose }: TransferReceiptProps) {
  const heading = useId();
  const confirmation = status.historical_confirmation;
  const outcome = confirmation?.outcome;
  const assets = validateTransferAssets(metadata, request.network_id);
  const native = creationFeeUnit(request.network_id);
  const amount = formatTransferAsset(request.amount.kind === 'exact' ? request.amount.amount_atomic : '0', request.asset_id, assets);
  const explorerUrl = confirmation?.transaction_hash ? getExplorerTxUrl(request.network_id, confirmation.transaction_hash) : null;

  const isReverted = outcome === 'execution_reverted';
  const isSucceeded = outcome === 'execution_succeeded';
  const isReviewRequired = status.status === 'review_required';

  return (
    <article aria-labelledby={heading} className="auth-panel" role="region">
      <header>
        <h3 id={heading}>
          {isSucceeded
            ? (en ? 'Transfer completed' : 'Envío completado')
            : isReverted
              ? (en ? 'Execution reverted' : 'Ejecución revertida')
              : isReviewRequired
                ? (en ? 'Transfer in review' : 'Envío en revisión')
                : (en ? 'Transfer pending' : 'Envío en proceso')}
        </h3>
        <p role="status">
          {isSucceeded
            ? (en ? 'Transaction included onchain and execution succeeded.' : 'Transacción confirmada en cadena con ejecución exitosa.')
            : isReverted
              ? (en ? 'Execution reverted onchain. Funds were NOT delivered to the recipient.' : 'La ejecución revirtió en la red. Los fondos NO fueron entregados al destinatario.')
              : isReviewRequired
                ? (en ? 'Conflicting transaction evidence was found. Do not create a duplicate transfer.' : 'Se registró evidencia contradictoria. No crees un envío duplicado.')
                : (en ? 'Transaction is waiting for block inclusion and finality.' : 'La transacción está esperando inclusión en bloque y finalidad.')}
        </p>
      </header>

      {status.status === 'reconciled' ? (
        <p className="auth-local" role="status">
          {en ? 'Balance reconciled; reserved funds released.' : 'Saldo reconciliado; reserva de fondos liberada.'}
        </p>
      ) : status.funds_reserved ? (
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

      {onClose ? (
        <button type="button" className="auth-primary btn btn-primary btn-block" onClick={onClose}>
          {en ? 'Done' : 'Listo'}
        </button>
      ) : null}
    </article>
  );
}
