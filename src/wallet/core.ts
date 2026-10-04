import { parseResourceId } from '@gatopago/shared/v3/primitives';
import type { EnabledAuthConfig } from '../auth/config';
import { exact, record, walletTransport, WalletCoreError } from './http';
export { WalletCoreError } from './http';

type Wallet = { id: string; user_id: string; status: 'active' | 'archived' };
export type WalletPage = { data: Wallet[]; next_cursor: string | null };

function parsePage(input: unknown): WalletPage {
  if (
    !record(input) ||
    !exact(input, ['data', 'next_cursor']) ||
    !Array.isArray(input.data) ||
    input.data.length > 20
  )
    throw new WalletCoreError('wallet/unavailable');
  const data = input.data.map((wallet: unknown): Wallet => {
    if (
      !record(wallet) ||
      !exact(wallet, ['id', 'user_id', 'status']) ||
      (wallet.status !== 'active' && wallet.status !== 'archived')
    )
      throw new WalletCoreError('wallet/unavailable');
    return {
      id: parseResourceId('wallet', wallet.id),
      user_id: parseResourceId('user', wallet.user_id),
      status: wallet.status,
    };
  });
  if (
    new Set(data.map((value) => value.id)).size !== data.length ||
    new Set(data.map((value) => value.user_id)).size > 1 ||
    data.some((value, index) => index > 0 && value.id <= data[index - 1].id)
  )
    throw new WalletCoreError('wallet/unavailable');
  const next = input.next_cursor === null ? null : parseResourceId('wallet', input.next_cursor);
  if (next !== null && (data.length !== 20 || next !== data.at(-1)?.id))
    throw new WalletCoreError('wallet/unavailable');
  return { data, next_cursor: next };
}

/** Browser-only transport; no private cache, polling, redirect following or monetary retry.
 * getToken must remain bound to the same Firebase user for the whole operation.
 */
export async function loadWalletPage(
  config: EnabledAuthConfig,
  getToken: () => Promise<string>,
  inputSignal: AbortSignal,
  after: string | null = null,
): Promise<WalletPage> {
  try {
    const { request } = walletTransport(config, getToken, inputSignal);
    const cursor = after === null ? '' : `&after=${parseResourceId('wallet', after)}`;
    const result = await request(`/wallets?limit=20${cursor}`, 'GET');

    if (result.status !== 200) throw new WalletCoreError('wallet/unavailable');
    const page = parsePage(result.value);
    if (after !== null && page.data.some((value) => value.id <= after))
      throw new WalletCoreError('wallet/unavailable');
    return page;
  } catch (error) {
    if (inputSignal.aborted) throw inputSignal.reason;
    throw error instanceof WalletCoreError ? error : new WalletCoreError('wallet/unavailable');
  }
}
