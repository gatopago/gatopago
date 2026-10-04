import { parseEnvironment } from '@gatopago/environment';
import environments from '@gatopago/environment/environments.json';
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createResourceId } from '@gatopago/shared/v3/primitives';
import { CLIENT_RELEASE_ID } from '@gatopago/shared/v3/client-release';
import {
  transferAssets,
  transferFormRequest,
  formatTransferAsset,
  validateTransferAssets,
} from '../src/wallet/transfer-form';
import { TransferForm } from '../src/wallet/TransferForm';
import type { BrowserAuth } from '../src/auth/browser';
import type { BalanceView } from '../src/wallet/balances';

function fixture() {
  const network = 'eip155:84532',
    native = `${network}/slip44:60`,
    token = `${network}/erc20:0x${'ab'.repeat(20)}`;
  const selected = {
    wallet_id: createResourceId('wallet'),
    wallet_account_id: createResourceId('walletAccount'),
    network_id: network,
    account_id: `0x${'11'.repeat(32)}`,
    address: `0x${'ab'.repeat(20)}`,
    deployment: { document: 'not-used-in-form-parser', digest: `0x${'11'.repeat(32)}` },
  };
  const metadata = [
    { asset_id: native, decimals: 18, symbol: 'ETH' },
    { asset_id: token, decimals: 6, symbol: 'USDC' },
  ];
  const balance: BalanceView = {
    account: { wallet_id: selected.wallet_id, id: selected.wallet_account_id, network_id: network },
    address: selected.address,
    observed_at: 1,
    expires_at: 2,
    block_number: '1',
    block_hash: `0x${'22'.repeat(32)}`,
    assets: metadata.map((a) => ({ ...a, amount_atomic: '1' })),
  };
  const input = {
    asset_id: token,
    destination: `0x${'cd'.repeat(20)}`,
    amount: '1234,567891',
    max: false,
  };
  return { selected, metadata, balance, input, native, token };
}
describe('Transfer form and asset metadata', () => {
  it('converts decimal input exactly with the token precision and actual client release', () => {
    const x = fixture(),
      request = transferFormRequest(x.selected, x.metadata, x.input);
    expect(request.amount).toEqual({ kind: 'exact', amount_atomic: '1234567891' });
    expect(request.client_release_id).toBe(CLIENT_RELEASE_ID);
    expect(request.destination.address_type).toBe('evm_unknown');
    expect(formatTransferAsset('1234567891', x.token, x.metadata)).toBe('1234.567891 USDC');
    expect(formatTransferAsset('1', x.native, x.metadata)).toBe('0.000000000000000001 ETH');
  });
  it('leaves MAX unresolved and never uses the displayed balance as a funding budget', () => {
    const x = fixture(),
      assets = transferAssets(x.balance, x.selected);
    expect(
      transferFormRequest(x.selected, assets, { ...x.input, max: true, amount: '' }).amount,
    ).toEqual({ kind: 'max' });

    expect(transferFormRequest(x.selected, assets, x.input).amount).toEqual({
      kind: 'exact',
      amount_atomic: '1234567891',
    });
    expect(assets[0]).not.toHaveProperty('amount_atomic');
  });
  it.each(['0', '-1', '1e3', '1.0000001', '1,000.20', ' 1', '1 ', 'Infinity', ''])(
    'rejects unsafe or ambiguous amount %s',
    (amount) => {
      const x = fixture();
      expect(() => transferFormRequest(x.selected, x.metadata, { ...x.input, amount })).toThrow();
    },
  );
  it.each(['0x' + '00'.repeat(20), 'not-an-address', '0x' + 'cd'.repeat(20) + '\n'])(
    'rejects invalid recipient %s',
    (destination) => {
      const x = fixture();
      expect(() =>
        transferFormRequest(x.selected, x.metadata, { ...x.input, destination }),
      ).toThrow();
    },
  );
  it.each(['wallet', 'instance', 'network', 'address'])(
    'rejects metadata from another %s context',
    (fault) => {
      const x = fixture();
      if (fault === 'wallet') x.balance.account.wallet_id = createResourceId('wallet');
      if (fault === 'instance') x.balance.account.id = createResourceId('walletAccount');
      if (fault === 'network') x.balance.account.network_id = 'eip155:1';
      if (fault === 'address') x.balance.address = `0x${'ee'.repeat(20)}`;
      expect(() => transferAssets(x.balance, x.selected)).toThrow();
    },
  );
  it.each(['duplicate', 'precision', 'symbol', 'network', 'native', 'nft'])(
    'rejects bad asset metadata %s',
    (fault) => {
      const x = fixture();
      if (fault === 'duplicate') x.metadata.push(x.metadata[0]);
      if (fault === 'precision') x.metadata[1].decimals = 1.5;
      if (fault === 'symbol') x.metadata[1].symbol = '<USDC>';
      if (fault === 'network') x.metadata[1].asset_id = 'eip155:1/slip44:60';
      if (fault === 'native') x.metadata.shift();
      if (fault === 'nft') x.metadata[1].asset_id = x.token.replace('erc20:', 'erc721:');
      expect(() => validateTransferAssets(x.metadata, x.selected.network_id)).toThrow();
    },
  );
  it('copies metadata and refuses unknown assets rather than inventing decimals', () => {
    const x = fixture(),
      assets = transferAssets(x.balance, x.selected);
    x.balance.assets[1].decimals = 18;
    expect(assets[1].decimals).toBe(6);
    expect(() => formatTransferAsset('1', 'unknown', assets)).toThrow();
    expect(() =>
      transferFormRequest(x.selected, assets, { ...x.input, asset_id: 'unknown' }),
    ).toThrow();
  });
  it.each([false, true])('renders an inert form in English=%s', (english) => {
    const x = fixture(),
      runtime = { credentialInventory: vi.fn(), transferPreparations: vi.fn(), subscribe: vi.fn() };
    const html = renderToStaticMarkup(
      createElement(TransferForm, {
        runtime: runtime as unknown as BrowserAuth,
        uid: 'synthetic',
        selected: x.selected,
        balance: x.balance,
        environment: parseEnvironment(environments.production),
        english,
      }),
    );
    expect(html).toContain(english ? 'Address or @username' : 'Dirección o @username');
    expect(html).toContain('USDC');
    expect(html).toContain('MAX');
    expect(html).toContain('inputMode="decimal"');
    expect(runtime.credentialInventory).not.toHaveBeenCalled();
    expect(runtime.transferPreparations).not.toHaveBeenCalled();
  });
});
