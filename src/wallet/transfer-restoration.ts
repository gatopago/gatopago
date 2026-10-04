import { CLIENT_RELEASE_ID } from '@gatopago/shared/v3/client-release';
import { loadPinnedDeploymentManifest, requireHash } from '@gatopago/shared/v3/deployment';
import { parseResourceId } from '@gatopago/shared/v3/primitives';
import type { EnabledAuthConfig } from '../auth/config';
import {
  parseTransferBookmark,
  transferBookmarkHash,
  type TransferBookmark,
} from './transfer-bookmark';
import { exact, record, walletTransport, WalletCoreError } from './http';
import { parseOwnedTransferDraft, type TransferSelection } from './transfer-preparation';
import { parseTransferStatus } from './transfers';
import { parseTransferDeliveryReceipt } from './transfer-command';
import { validateTransferAssets } from './transfer-form';

const fail = () => new WalletCoreError('wallet/unavailable');
export function parseTransferRestoration(
  input: unknown,
  selected: TransferSelection,
  bookmark: TransferBookmark,
  environment: EnabledAuthConfig['deployment'],
  now = Math.floor(Date.now() / 1000),
) {
  if (
    bookmark.wallet_id !== selected.wallet_id ||
    bookmark.wallet_account_id !== selected.wallet_account_id ||
    bookmark.network_id !== selected.network_id ||
    !record(input) ||
    !exact(input, [
      'schema_version',
      'consent_digest',
      'review_json',
      'review_sha256',
      'status',
      'checked_at',
      'asset_metadata',
    ]) ||
    input.schema_version !== 1 ||
    input.consent_digest !== bookmark.consent_digest ||
    typeof input.checked_at !== 'number' ||
    !Number.isSafeInteger(input.checked_at) ||
    input.checked_at < 1 ||
    input.checked_at > now + 5
  )
    throw fail();
  if (input.status === null) {
    if (input.review_json !== null || input.review_sha256 !== null || input.asset_metadata !== null)
      throw fail();
    return Object.freeze({
      wire: structuredClone(input),
      checked_at: input.checked_at,
      transfer: null,
    });
  }
  const restored = parseOwnedTransferDraft(
      input.review_json,
      input.review_sha256,
      selected,
      environment,
      now,
    ),
    c = restored.candidate;
  if (
    c.digest !== bookmark.consent_digest ||
    c.plan.validUntil !== bookmark.expires_at ||
    !record(input.status)
  )
    throw fail();
  const status = parseTransferStatus(
    input.status,
    {
      wallet_id: selected.wallet_id,
      wallet_account_id: selected.wallet_account_id,
      network_id: selected.network_id,
      operation_id: parseResourceId('operation', input.status.operation_id),
    },
    now,
  );
  if (status.userop_hash !== c.userOpHash) throw fail();
  if (!Array.isArray(input.asset_metadata) || input.asset_metadata.length > 2) throw fail();
  const metadata = validateTransferAssets(
    input.asset_metadata.map((a) => {
      if (
        !record(a) ||
        !exact(a, ['asset_id', 'symbol', 'decimals']) ||
        typeof a.asset_id !== 'string' ||
        typeof a.symbol !== 'string' ||
        typeof a.decimals !== 'number'
      )
        throw fail();
      return { asset_id: a.asset_id, symbol: a.symbol, decimals: a.decimals };
    }),
    selected.network_id,
  );
  const needed = new Set([c.request.asset_id, restored.review.context.native_asset_id]);
  if (metadata.length !== needed.size || metadata.some((a) => !needed.has(a.asset_id)))
    throw fail();
  return Object.freeze({
    wire: structuredClone(input),
    checked_at: input.checked_at,
    transfer: { ...restored, status, metadata },
  });
}
export function transferRestorationClient(config: EnabledAuthConfig, token: () => Promise<string>) {
  return {
    async restore(
      selectedInput: TransferSelection,
      bookmarkInput: TransferBookmark,
      signal: AbortSignal,
    ) {
      const selected = structuredClone(selectedInput),
        bookmark = structuredClone(bookmarkInput);
      // Validate the locator before acquiring a token or composing its path.
      const locator = parseTransferBookmark(transferBookmarkHash(bookmark))!;
      if (
        locator.wallet_id !== selected.wallet_id ||
        locator.wallet_account_id !== selected.wallet_account_id ||
        locator.network_id !== selected.network_id
      )
        throw fail();
      const result = await walletTransport(config, token, signal, 'transfer-preparation').request(
        `/wallets/${locator.wallet_id}/accounts/${locator.wallet_account_id}/transfer-consents/${locator.consent_digest}`,
        'GET',
      );
      if (result.status !== 200) throw fail();
      return parseTransferRestoration(result.value, selected, locator, config.deployment);
    },
    async deliver(
      selectedInput: TransferSelection,
      bookmarkInput: TransferBookmark,
      wireInput: unknown,
      signal: AbortSignal,
    ) {
      signal.throwIfAborted();
      const selected = structuredClone(selectedInput),
        bookmark = structuredClone(bookmarkInput),
        wire: unknown = structuredClone(wireInput);
      const check = () => {
        const restored = parseTransferRestoration(wire, selected, bookmark, config.deployment),
          t = restored.transfer;
        if (
          !t ||
          t.status.status !== 'held' ||
          t.candidate.request.client_release_id !== CLIENT_RELEASE_ID ||
          Math.floor(Date.now() / 1000) >= t.candidate.plan.validUntil
        )
          throw fail();
        return t;
      };
      const transfer = check();
      requireHash(selected.deployment.digest);
      const manifest = loadPinnedDeploymentManifest(
        selected.deployment.document,
        selected.deployment.digest,
      );
      const getToken = async () => {
        check();
        const value = await token();
        check();
        return value;
      };
      const result = await walletTransport(config, getToken, signal, 'transfer-command').request(
        `/wallets/${selected.wallet_id}/accounts/${selected.wallet_account_id}/transfers/${transfer.status.operation_id}/deliver`,
        'POST',
        { consent_digest: transfer.candidate.digest },
        { generation: '3', contract_manifest_version: manifest.manifest_id },
      );
      if (result.status !== 202) throw fail();
      return parseTransferDeliveryReceipt(
        result.value,
        transfer.status.operation_id,
        transfer.candidate.userOpHash,
      );
    },
  };
}
