import { loadPinnedDeploymentManifest, requireHash } from '@gatopago/shared/v3/deployment';
import { parseResourceId } from '@gatopago/shared/v3/primitives';
import { parseTransferRequest, type TransferRequest } from '@gatopago/shared/v3/transfer';
import { verifyTransferQuorum } from '@gatopago/shared/v3/transfer-authorization';
import {
  parseTransferConfirmation,
  serializeTransferConfirmation,
} from '@gatopago/shared/v3/transfer-wire';
import type { EnabledAuthConfig } from '../auth/config';
import { parseTransferPreparation, type TransferSelection } from './transfer-preparation';
import { exact, record, walletTransport, WalletCoreError } from './http';

export type TransferProofs = Parameters<typeof verifyTransferQuorum>[3];
export type TransferReview = { readonly wire: unknown };
type Preparation = ReturnType<typeof parseTransferPreparation>;
const fail = () => new WalletCoreError('wallet/unavailable');

/** Reservation receipt, NOT an onchain receipt or permission to skip preflight. */
export function parseTransferConfirmationReceipt(input: unknown, preparation: Preparation) {
  if (
    !record(input) ||
    !exact(input, [
      'id',
      'state',
      'expires_at',
      'send_enabled',
      'preparation_id',
      'consent_digest',
    ]) ||
    input.preparation_id !== preparation.preparation_id ||
    input.consent_digest !== preparation.candidate.digest ||
    input.expires_at !== preparation.expires_at ||
    input.send_enabled !== false ||
    (input.state !== 'held' && input.state !== 'delivery_pending' && input.state !== 'reconciled')
  )
    throw fail();
  return Object.freeze({
    id: parseResourceId('operation', input.id),
    state: input.state,
    expires_at: input.expires_at,
    preparation_id: preparation.preparation_id,
    consent_digest: preparation.candidate.digest,
    send_enabled: false as const,
  });
}

export function parseTransferDeliveryReceipt(
  input: unknown,
  operationId: string,
  userOpHash: string,
) {
  if (
    !record(input) ||
    !exact(input, ['operation_id', 'userop_hash', 'delivery', 'settlement']) ||
    input.operation_id !== parseResourceId('operation', operationId) ||
    input.userop_hash !== userOpHash ||
    (input.delivery !== 'accepted' && input.delivery !== 'uncertain') ||
    input.settlement !== 'unconfirmed'
  )
    throw fail();
  requireHash(input.userop_hash);
  return Object.freeze({
    operation_id: operationId,
    userop_hash: input.userop_hash,
    delivery: input.delivery,
    settlement: 'unconfirmed' as const,
  });
}

/** Explicit single requests only. Errors/timeouts after an HTTP mutation are NOT
 * proof of failure: callers must retain operation identity and read status.
 * No passkey prompt, retry, background submission, local storage or RPC here. */
export function transferCommandClient(config: EnabledAuthConfig, token: () => Promise<string>) {
  function capture(
    selected: TransferSelection,
    requested: TransferRequest,
    review: TransferReview,
  ) {
    const expected = structuredClone(selected),
      request = parseTransferRequest(requested),
      wire: unknown = structuredClone(review.wire);
    const view = () => parseTransferPreparation(wire, expected, request, config.deployment);
    const prepared = view();
    requireHash(expected.deployment.digest);
    const manifest = loadPinnedDeploymentManifest(
      expected.deployment.document,
      expected.deployment.digest,
    );
    const path = `/wallets/${prepared.candidate.request.wallet_id}/accounts/${prepared.wallet_account_id}`;
    const account = { generation: '3', contract_manifest_version: manifest.manifest_id };
    // Recheck consent lifetime after token acquisition too. A refresh must not
    // send a proof whose window expired while waiting for Firebase.
    const getToken = async () => {
      view();
      const value = await token();
      view();
      return value;
    };
    return { prepared, view, path, account, getToken };
  }
  return {
    async confirm(
      selected: TransferSelection,
      request: TransferRequest,
      review: TransferReview,
      inputProofs: TransferProofs,
      signal: AbortSignal,
    ) {
      signal.throwIfAborted();
      const c = capture(selected, request, review),
        wire = serializeTransferConfirmation(c.prepared.candidate.digest, inputProofs);
      const { proofs } = parseTransferConfirmation(wire);
      await verifyTransferQuorum(
        c.prepared.candidate.digest,
        c.prepared.review.policy,
        c.prepared.review.scope,
        proofs,
      );
      signal.throwIfAborted();
      c.view();
      const result = await walletTransport(config, c.getToken, signal, 'transfer-command').request(
        `${c.path}/transfer-preparations/${c.prepared.preparation_id}/confirm`,
        'POST',
        wire,
        c.account,
      );
      if (result.status !== 200) throw fail();
      return parseTransferConfirmationReceipt(result.value, c.prepared);
    },
    async deliver(
      selected: TransferSelection,
      request: TransferRequest,
      review: TransferReview,
      confirmation: unknown,
      signal: AbortSignal,
    ) {
      signal.throwIfAborted();
      const c = capture(selected, request, review),
        receipt = parseTransferConfirmationReceipt(structuredClone(confirmation), c.prepared);
      if (receipt.state !== 'held') throw fail();
      const result = await walletTransport(config, c.getToken, signal, 'transfer-command').request(
        `${c.path}/transfers/${receipt.id}/deliver`,
        'POST',
        { consent_digest: c.prepared.candidate.digest },
        c.account,
      );
      if (result.status !== 202) throw fail();
      return parseTransferDeliveryReceipt(
        result.value,
        receipt.id,
        c.prepared.candidate.userOpHash,
      );
    },
  };
}
