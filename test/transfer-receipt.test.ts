import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createResourceId } from '@gatopago/shared/v3/primitives';
import { CLIENT_RELEASE_ID } from '@gatopago/shared/v3/client-release';
import type { TransferRequest } from '@gatopago/shared/v3/transfer';
import { TransferReceipt } from '../src/wallet/TransferReceipt';
import type { TransferLocator } from '../src/wallet/transfers';

function fixture() {
  const selected = {
    wallet_id: createResourceId('wallet'),
    wallet_account_id: createResourceId('walletAccount'),
    network_id: 'eip155:421614' as const,
    account_id: '0x1111111111111111111111111111111111111111',
    address: '0x1111111111111111111111111111111111111111',
    deployment: { document: '{}', digest: `0x${'aa'.repeat(32)}` },
  };
  const request: TransferRequest = {
    schema_version: 1,
    generation: 3,
    wallet_id: selected.wallet_id,
    network_id: selected.network_id,
    asset_id: `${selected.network_id}/erc20:0xaf88d065e77c8cc2239327c5edb3a432268e5831`,
    destination: { address: '0x2222222222222222222222222222222222222222', address_type: 'evm_eoa' },
    amount: { kind: 'exact', amount_atomic: '10000000' },
    client_release_id: CLIENT_RELEASE_ID,
  };
  const metadata = [
    { asset_id: `${selected.network_id}/slip44:60`, decimals: 18, symbol: 'ETH' },
    { asset_id: request.asset_id, decimals: 6, symbol: 'USDC' },
  ];
  const locator: TransferLocator = {
    wallet_id: selected.wallet_id,
    wallet_account_id: selected.wallet_account_id,
    network_id: selected.network_id,
    operation_id: createResourceId('operation'),
  };
  const baseStatus = {
    ...locator,
    userop_hash: `0x${'bb'.repeat(32)}`,
    settlement: 'not_assessed' as const,
    send_enabled: false as const,
  };
  return { selected, request, metadata, locator, baseStatus };
}

describe('Consumer TransferReceipt component', () => {
  function completedFixture() {
    const f = fixture();
    return {
      ...f,
      english: true,
      amountAtomic: '10000000',
      status: {
        ...f.baseStatus,
        status: 'reconciled' as const,
        funds_reserved: false,
        historical_confirmation: {
          transaction_hash: `0x${'cc'.repeat(32)}`,
          outcome: 'execution_succeeded' as const,
          recorded_at: 1700000000,
        },
      },
    };
  }
  it.each(['execution_succeeded', 'execution_reverted'] as const)(
    'prioritizes conflicting evidence over a previous %s outcome',
    (outcome) => {
      const f = completedFixture();
      const markup = renderToStaticMarkup(
        createElement(TransferReceipt, {
          ...f,
          status: {
            ...f.status,
            status: 'review_required',
            funds_reserved: true,
            historical_confirmation: { ...f.status.historical_confirmation, outcome },
          },
          onClose: () => {},
        }),
      );
      expect(markup).toContain('Transfer in review');
      expect(markup).toContain('Conflicting transaction evidence');
      expect(markup).not.toContain('Transfer completed');
      expect(markup).not.toContain('Funds were NOT delivered');
      expect(markup).not.toContain('>Done<');
    },
  );
  it('uses the exact reviewed MAX amount instead of reporting zero', () => {
    const f = completedFixture();
    const markup = renderToStaticMarkup(
      createElement(TransferReceipt, {
        ...f,
        request: { ...f.request, amount: { kind: 'max' } },
        amountAtomic: '12345987654',
      }),
    );
    expect(markup).toContain('12345.987654 USDC (MAX)');
    expect(markup).not.toContain('>0 USDC');
  });
  it.each(['0', '-1', '1', '01'])(
    'rejects an invalid or mismatched reviewed amount %s',
    (amountAtomic) => {
      const f = completedFixture();
      expect(() =>
        renderToStaticMarkup(createElement(TransferReceipt, { ...f, amountAtomic })),
      ).toThrow();
    },
  );
  it('keeps a confirmed transfer open until reconciliation releases its reservation', () => {
    const f = completedFixture();
    const markup = renderToStaticMarkup(
      createElement(TransferReceipt, {
        ...f,
        status: { ...f.status, status: 'confirmation_recorded', funds_reserved: true },
        onClose: () => {},
      }),
    );
    expect(markup).toContain('Transfer confirmed');
    expect(markup).not.toContain('Transfer completed');
    expect(markup).not.toContain('>Done<');
    expect(markup).toContain('Funds remain reserved');
  });
  it('does not describe a held or expired operation as awaiting block inclusion', () => {
    const f = completedFixture();
    const held = renderToStaticMarkup(
      createElement(TransferReceipt, {
        ...f,
        status: {
          ...f.status,
          status: 'held',
          funds_reserved: true,
          historical_confirmation: null,
        },
        onClose: () => {},
      }),
    );
    expect(held).toContain('Transfer reserved');
    expect(held).toContain('has not been submitted');
    expect(held).not.toContain('>Done<');
    const expired = renderToStaticMarkup(
      createElement(TransferReceipt, {
        ...f,
        status: {
          ...f.status,
          status: 'expired',
          funds_reserved: false,
          historical_confirmation: null,
        },
        onClose: () => {},
      }),
    );
    expect(expired).toContain('Sending window expired');
    expect(expired).toContain('No execution was confirmed');
    expect(expired).toContain('>Done<');
  });
  it('rejects a receipt belonging to another account or inconsistent reservation state', () => {
    const f = completedFixture();
    expect(() =>
      renderToStaticMarkup(
        createElement(TransferReceipt, {
          ...f,
          status: { ...f.status, wallet_account_id: createResourceId('walletAccount') },
        }),
      ),
    ).toThrow();
    expect(() =>
      renderToStaticMarkup(
        createElement(TransferReceipt, { ...f, status: { ...f.status, funds_reserved: true } }),
      ),
    ).toThrow();
  });
  it('offers Done only for a terminal result and does not invoke it on rendering', () => {
    const f = completedFixture();
    let closes = 0;
    const markup = renderToStaticMarkup(
      createElement(TransferReceipt, {
        ...f,
        onClose: () => {
          closes++;
        },
      }),
    );
    expect(markup).toContain('>Done<');
    expect(closes).toBe(0);
  });
  it('renders successful transfer with transaction hash and explorer link', () => {
    const { selected, request, metadata, baseStatus } = fixture();
    const status = {
      ...baseStatus,
      status: 'reconciled' as const,
      funds_reserved: false,
      historical_confirmation: {
        transaction_hash: `0x${'cc'.repeat(32)}`,
        outcome: 'execution_succeeded' as const,
        recorded_at: 1700000000,
      },
    };
    const markupEn = renderToStaticMarkup(
      createElement(TransferReceipt, {
        english: true,
        request,
        selected,
        status,
        metadata,
        amountAtomic: '10000000',
      }),
    );
    expect(markupEn).toContain('Transfer completed');
    expect(markupEn).toContain('Transaction included onchain and execution succeeded.');
    expect(markupEn).toContain('Balance reconciled; reserved funds released.');
    expect(markupEn).toContain(status.historical_confirmation.transaction_hash);
    expect(markupEn).toContain('https://sepolia.arbiscan.io/tx/');
    expect(markupEn).toContain(request.destination.address);
    expect(markupEn).toContain('10 USDC');

    const markupEs = renderToStaticMarkup(
      createElement(TransferReceipt, {
        english: false,
        request,
        selected,
        status,
        metadata,
        amountAtomic: '10000000',
      }),
    );
    expect(markupEs).toContain('Envío completado');
    expect(markupEs).toContain('Transacción confirmada en cadena con ejecución exitosa.');
    expect(markupEs).toContain('Saldo reconciliado; reserva de fondos liberada.');
  });

  it('renders reverted execution clearly and NEVER as paid or successful', () => {
    const { selected, request, metadata, baseStatus } = fixture();
    const status = {
      ...baseStatus,
      status: 'confirmation_recorded' as const,
      funds_reserved: true,
      historical_confirmation: {
        transaction_hash: `0x${'dd'.repeat(32)}`,
        outcome: 'execution_reverted' as const,
        recorded_at: 1700000000,
      },
    };
    const markup = renderToStaticMarkup(
      createElement(TransferReceipt, {
        english: true,
        request,
        selected,
        status,
        metadata,
        amountAtomic: '10000000',
      }),
    );
    expect(markup).toContain('Execution reverted');
    expect(markup).toContain(
      'Execution reverted onchain. Funds were NOT delivered to the recipient.',
    );
    expect(markup).not.toContain('Transfer completed');
    expect(markup).toContain(status.historical_confirmation.transaction_hash);
  });

  it('renders pending status while waiting for inclusion', () => {
    const { selected, request, metadata, baseStatus } = fixture();
    const status = {
      ...baseStatus,
      status: 'delivery_pending' as const,
      funds_reserved: true,
      historical_confirmation: null,
    };
    const markup = renderToStaticMarkup(
      createElement(TransferReceipt, {
        english: true,
        request,
        selected,
        status,
        metadata,
        amountAtomic: '10000000',
      }),
    );
    expect(markup).toContain('Transfer pending');
    expect(markup).toContain('Transaction is waiting for block inclusion and finality.');
    expect(markup).toContain('Funds remain reserved while finality is observed.');
  });
});
