import type { Environment } from '@gatopago/environment';
import { getAddress } from 'viem';
import { CLIENT_RELEASE_ID } from '@gatopago/shared/v3/client-release';
import { loadPinnedDeploymentManifest, requireHash } from '@gatopago/shared/v3/deployment';
import { parseNetworkId, parseResourceId } from '@gatopago/shared/v3/primitives';
import { parseTransferRequest, type TransferRequest } from '@gatopago/shared/v3/transfer';
import { readTransferDraft } from '@gatopago/shared/v3/transfer-review-record';
import type { EnabledAuthConfig } from '../auth/config';
import { exact, record, walletTransport, WalletCoreError } from './http';

export type TransferSelection = {
  wallet_id: string;
  wallet_account_id: string;
  network_id: string;
  account_id: string;
  address: string;
  deployment: { document: string; digest: string };
};
const fail = () => new WalletCoreError('wallet/unavailable');

function selection(input: TransferSelection) {
  const value = structuredClone(input);
  requireHash(value.deployment.digest);
  const manifest = loadPinnedDeploymentManifest(value.deployment.document, value.deployment.digest);
  requireHash(value.account_id);
  if (
    manifest.lifecycle_status !== 'deployed' ||
    manifest.generation !== 3 ||
    manifest.network_id !== parseNetworkId(value.network_id)
  )
    throw fail();
  return {
    ...value,
    wallet_id: parseResourceId('wallet', value.wallet_id),
    wallet_account_id: parseResourceId('walletAccount', value.wallet_account_id),
    address: getAddress(value.address),
    manifest,
  };
}

export function parseOwnedTransferDraft(
  json: unknown,
  digest: unknown,
  selected: TransferSelection,
  environment: Environment,
  now = Math.floor(Date.now() / 1000),
) {
  const expected = selection(selected),
    restored = readTransferDraft(json, digest),
    { review, candidate } = restored;
  if (
    !Number.isSafeInteger(now) ||
    now < review.prepared_at ||
    candidate.request.wallet_id !== expected.wallet_id ||
    candidate.request.network_id !== expected.network_id ||
    review.context.account_id !== expected.account_id ||
    candidate.account !== expected.address ||
    candidate.deployment_digest !== expected.deployment.digest ||
    candidate.plan.entryPoint !== getAddress(expected.manifest.entry_point) ||
    review.scope.origin !== environment.web_origin ||
    review.scope.rpId !== environment.webauthn_rp_id
  )
    throw fail();
  return restored;
}

export function parseTransferPreparation(
  input: unknown,
  selected: TransferSelection,
  requested: TransferRequest,
  environment: Environment,
  now = Math.floor(Date.now() / 1000),
  preparationId?: string,
) {
  const expected = selection(selected),
    request = parseTransferRequest(requested),
    config = environment;
  if (
    !record(input) ||
    !exact(input, [
      'schema_version',
      'preparation_id',
      'wallet_id',
      'wallet_account_id',
      'consent_digest',
      'review_json',
      'review_sha256',
      'expires_at',
      'send_enabled',
    ]) ||
    input.schema_version !== 1 ||
    input.wallet_id !== expected.wallet_id ||
    input.wallet_account_id !== expected.wallet_account_id ||
    input.send_enabled !== false ||
    (preparationId !== undefined && input.preparation_id !== preparationId) ||
    request.wallet_id !== expected.wallet_id ||
    request.network_id !== expected.network_id ||
    request.client_release_id !== CLIENT_RELEASE_ID
  )
    throw fail();
  const id = parseResourceId('operation', input.preparation_id);
  const restored = parseOwnedTransferDraft(
      input.review_json,
      input.review_sha256,
      expected,
      config,
      now,
    ),
    { review, candidate } = restored;
  if (
    !Number.isSafeInteger(now) ||
    now < review.prepared_at ||
    now >= candidate.plan.validUntil ||
    input.expires_at !== candidate.plan.validUntil ||
    input.consent_digest !== candidate.digest ||
    JSON.stringify(candidate.request) !== JSON.stringify(request) ||
    review.context.account_id !== expected.account_id ||
    candidate.account !== expected.address ||
    candidate.deployment_digest !== expected.deployment.digest ||
    candidate.plan.entryPoint !== getAddress(expected.manifest.entry_point) ||
    review.scope.origin !== config.web_origin ||
    review.scope.rpId !== config.webauthn_rp_id
  )
    throw fail();
  return Object.freeze({
    wire: Object.freeze(structuredClone(input)),
    preparation_id: id,
    wallet_account_id: expected.wallet_account_id,
    ...restored,
    expires_at: candidate.plan.validUntil,
    send_enabled: false as const,
  });
}

export function transferPreparationClient(config: EnabledAuthConfig, token: () => Promise<string>) {
  async function load(
    selected: TransferSelection,
    input: TransferRequest,
    signal: AbortSignal,
    preparationId?: string,
  ) {
    const expected = selection(selected),
      request = parseTransferRequest(input);
    if (
      request.wallet_id !== expected.wallet_id ||
      request.network_id !== expected.network_id ||
      request.client_release_id !== CLIENT_RELEASE_ID
    )
      throw fail();
    const id =
      preparationId === undefined ? undefined : parseResourceId('operation', preparationId);
    const result = await walletTransport(config, token, signal, 'transfer-preparation').request(
      `/wallets/${expected.wallet_id}/accounts/${expected.wallet_account_id}/transfer-preparations${id ? `/${id}` : ''}`,
      id ? 'GET' : 'POST',
      request,
      { generation: '3', contract_manifest_version: expected.manifest.manifest_id },
    );
    if (result.status !== 200) throw fail();
    return parseTransferPreparation(
      result.value,
      expected,
      request,
      config.deployment,
      Math.floor(Date.now() / 1000),
      id,
    );
  }
  return {
    prepare: (selected: TransferSelection, request: TransferRequest, signal: AbortSignal) =>
      load(selected, request, signal),
    read: (
      selected: TransferSelection,
      request: TransferRequest,
      id: string,
      signal: AbortSignal,
    ) => load(selected, request, signal, id),
  };
}
