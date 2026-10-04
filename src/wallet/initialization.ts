import { loadPinnedCreationProfile } from '@gatopago/shared/v3/initialization';
import {
  parseInitializationCursor,
  parseInitializationHistory,
  parseInitializationPreparation,
  parseInitializationProof,
  parseInitializationReceipt,
  parseInitializationRequest,
  parseInitializationRestoration,
  type InitializationHistoryItem,
} from '@gatopago/shared/v3/initialization-wire';
import type { AccountReleaseContext } from '@gatopago/shared/v3/client-release';
import { encodeWebAuthnAssertion } from '@gatopago/shared/v3/webauthn';
import type { EnabledAuthConfig } from '../auth/config';
import { walletTransport, WalletCoreError } from './http';

type Pin = { readonly document: string; readonly digest: `0x${string}` };
type Consent = Readonly<{
  preparation: ReturnType<typeof parseInitializationPreparation>;
  expected: Parameters<typeof parseInitializationPreparation>[1];
}>;

class InitializationClientError extends Error {
  constructor(
    readonly code:
      | 'initialization/unavailable'
      | 'initialization/invalid'
      | 'initialization/expired'
      | 'initialization/conflict'
      | 'initialization/limit'
      | 'initialization/profile-unavailable',
  ) {
    super(code);
    this.name = 'InitializationClientError';
  }
}
function requireSuccess(result: { status: number; value: unknown }) {
  if (result.status === 200) return;
  if (result.status === 410) throw new InitializationClientError('initialization/expired');
  if (result.status === 429) throw new InitializationClientError('initialization/limit');
  if (result.status === 400) throw new InitializationClientError('initialization/invalid');
  if (result.status === 409) throw new InitializationClientError('initialization/conflict');
  if (
    result.status === 503 &&
    result.value &&
    typeof result.value === 'object' &&
    'error_code' in result.value &&
    ['PROFILE_UNAVAILABLE', 'ACCOUNT_VERSION_UNAVAILABLE'].includes(String(result.value.error_code))
  )
    throw new InitializationClientError('initialization/profile-unavailable');
  throw new InitializationClientError('initialization/unavailable');
}

export function initializationClient(
  config: EnabledAuthConfig,
  getToken: () => Promise<string>,
  pin: Pin,
) {
  const trusted = Object.freeze({ ...pin });
  const profile = loadPinnedCreationProfile(trusted.document, trusted.digest);
  const environment = config.deployment;
  if (config.mode !== 'firebase' || config.webOrigin !== environment.web_origin)
    throw new WalletCoreError('wallet/unavailable');
  const scope = Object.freeze({ rpId: environment.webauthn_rp_id, origin: environment.web_origin });
  const account: AccountReleaseContext = Object.freeze({
    generation: String(profile.deployment.generation),
    contract_manifest_version: profile.deployment.manifest_id,
  });
  return {
    async history(after: string | null, signal: AbortSignal) {
      const cursor = after === null ? null : parseInitializationCursor(after);
      const path = `/account-initializations${after === null ? '' : `?after=${encodeURIComponent(after)}`}`;
      const result = await walletTransport(config, getToken, signal).request(
        path,
        'GET',
        {},
        'identity',
      );
      requireSuccess(result);
      try {
        const history = parseInitializationHistory(result.value);
        if (
          cursor &&
          history.data.some(
            (row) =>
              row.created_at > cursor.createdAt ||
              (row.created_at === cursor.createdAt && row.initialization_id >= cursor.id),
          )
        )
          throw new Error('Non advancing history');
        signal.throwIfAborted();
        return history;
      } catch {
        throw new InitializationClientError('initialization/invalid');
      }
    },
    async restore(selected: InitializationHistoryItem, signal: AbortSignal) {
      const item = parseInitializationHistory({
        observed_at: Math.max(
          selected.created_at,
          selected.state === 'expired' ? selected.expires_at : selected.created_at,
        ),
        data: [selected],
        next_cursor: null,
      }).data[0];
      if (item.profile_sha256 !== trusted.digest)
        throw new InitializationClientError('initialization/profile-unavailable');
      const result = await walletTransport(config, getToken, signal).request(
        `/account-initializations/${item.initialization_id}`,
        'GET',
        {},
        'identity',
      );
      requireSuccess(result);
      signal.throwIfAborted();
      try {
        return parseInitializationRestoration(result.value, item, trusted, scope);
      } catch {
        throw new InitializationClientError('initialization/invalid');
      }
    },
    async prepare(
      request: { request_id: string; credential_ref: string; user_salt_commitment: `0x${string}` },
      signal: AbortSignal,
    ) {
      const input = parseInitializationRequest({ ...request, profile_sha256: trusted.digest });
      const expected = Object.freeze({
        id: input.id,
        credentialRef: input.credentialRef,
        userSaltCommitment: input.userSaltCommitment,
        document: trusted.document,
        profileDigest: trusted.digest,
        scope,
      });
      const result = await walletTransport(config, getToken, signal).request(
        '/account-initializations',
        'POST',
        {
          request_id: input.id,
          credential_ref: input.credentialRef,
          profile_sha256: trusted.digest,
          user_salt_commitment: input.userSaltCommitment,
        },
        account,
      );
      requireSuccess(result);
      let preparation;
      try {
        preparation = parseInitializationPreparation(result.value, expected);
      } catch {
        throw new InitializationClientError('initialization/invalid');
      }
      signal.throwIfAborted();
      return Object.freeze({ preparation, expected });
    },
    async authorize(consent: Consent, proof: unknown, signal: AbortSignal) {
      if (
        consent.expected.document !== trusted.document ||
        consent.expected.profileDigest !== trusted.digest ||
        consent.expected.scope.origin !== scope.origin ||
        consent.expected.scope.rpId !== scope.rpId
      )
        throw new WalletCoreError('wallet/unavailable');
      const prepared = parseInitializationPreparation(consent.preparation, consent.expected);
      encodeWebAuthnAssertion({
        scope,
        key: prepared.public_key,
        challenge: prepared.approval_digest,
        response: parseInitializationProof(proof),
      });
      const result = await walletTransport(config, getToken, signal).request(
        `/account-initializations/${prepared.initialization_id}/authorize`,
        'POST',
        proof as object,
        account,
      );
      requireSuccess(result);
      let receipt;
      try {
        receipt = parseInitializationReceipt(result.value, {
          id: prepared.initialization_id,
          profileDigest: trusted.digest,
          approvalDigest: prepared.approval_digest,
        });
      } catch {
        throw new InitializationClientError('initialization/invalid');
      }
      if (receipt.state !== 'authorized')
        throw new InitializationClientError('initialization/invalid');
      signal.throwIfAborted();
      return receipt;
    },
  };
}
