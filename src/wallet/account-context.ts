import { getAddress, isAddressEqual } from 'viem';
import { predictAccountAddress } from '@gatopago/shared/v3/authorizations';
import { loadPinnedDeploymentManifest, requireHash } from '@gatopago/shared/v3/deployment';
import { parseNetworkId, parseResourceId } from '@gatopago/shared/v3/primitives';
import type { EnabledAuthConfig } from '../auth/config';
import type { AccountChoice } from './balances';
import type { TransferSelection } from './transfer-preparation';
import { exact, record, walletTransport, WalletCoreError } from './http';

export type AccountContextPin = Readonly<{ document: string; digest: string }>;
const fail = () => new WalletCoreError('wallet/unavailable');

/** The response is an owned identity projection, not chain evidence. Its pin must
 * additionally match an independently admitted Web release, never itself. */
export function parseAccountContext(
  input: unknown,
  selected: AccountChoice,
  pins: readonly AccountContextPin[],
): TransferSelection {
  const wallet = parseResourceId('wallet', selected.wallet_id),
    account = parseResourceId('walletAccount', selected.id);
  const network = parseNetworkId(selected.network_id);
  if (
    !record(input) ||
    !exact(input, [
      'schema_version',
      'wallet_id',
      'wallet_account_id',
      'network_id',
      'account_id',
      'address',
      'deployment',
      'spend_readiness',
      'receive_enabled',
      'send_enabled',
    ]) ||
    input.schema_version !== 1 ||
    input.wallet_id !== wallet ||
    input.wallet_account_id !== account ||
    input.network_id !== network ||
    input.spend_readiness !== 'not_assessed' ||
    input.receive_enabled !== false ||
    input.send_enabled !== false ||
    !record(input.deployment) ||
    !exact(input.deployment, ['document', 'digest']) ||
    typeof input.address !== 'string' ||
    typeof input.deployment.document !== 'string'
  )
    throw fail();
  const deployment = input.deployment;
  requireHash(input.account_id);
  requireHash(deployment.digest);
  if (pins.length > 32) throw fail();
  const matches = pins.filter((pin) => pin.digest === deployment.digest);
  if (matches.length !== 1 || matches[0].document !== deployment.document) throw fail();
  requireHash(matches[0].digest);
  const manifest = loadPinnedDeploymentManifest(matches[0].document, matches[0].digest);
  const address = getAddress(input.address);
  if (
    manifest.lifecycle_status !== 'deployed' ||
    manifest.generation !== 3 ||
    manifest.network_id !== network ||
    !isAddressEqual(
      predictAccountAddress(
        manifest.components.factory.address,
        input.account_id,
        manifest.proxy.init_code_hash,
      ),
      address,
    )
  )
    throw fail();
  return {
    wallet_id: wallet,
    wallet_account_id: account,
    network_id: network,
    account_id: input.account_id,
    address,
    deployment: { document: matches[0].document, digest: matches[0].digest },
  };
}

export function accountContextClient(
  config: EnabledAuthConfig,
  token: () => Promise<string>,
  pinsInput: readonly AccountContextPin[],
) {
  const pins = pinsInput.map(({ document, digest }) => ({ document, digest }));
  return {
    async read(selected: AccountChoice, signal: AbortSignal): Promise<TransferSelection> {
      const expected = {
        id: parseResourceId('walletAccount', selected.id),
        wallet_id: parseResourceId('wallet', selected.wallet_id),
        network_id: parseNetworkId(selected.network_id),
      };
      signal.throwIfAborted();
      // Do not query private resources when this Web release admits no deployment.
      if (!pins.length || pins.length > 32) throw fail();
      const result = await walletTransport(config, token, signal, 'transfer-preparation').request(
        `/wallets/${expected.wallet_id}/accounts/${expected.id}/context`,
        'GET',
      );
      if (result.status !== 200) throw fail();
      return parseAccountContext(result.value, expected, pins);
    },
  };
}
