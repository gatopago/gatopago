import { loadPinnedCreationProfile } from '@gatopago/shared/v3/initialization';
import { parseInitializationPreparation, parseInitializationProof } from '@gatopago/shared/v3/initialization-wire';
import { parseCreationCapRequest, parseCreationPreview, parseCreationReceipt, type CreationConsent } from '@gatopago/shared/v3/creation-operation-wire';
import { encodeWebAuthnAssertion } from '@gatopago/shared/v3/webauthn';
import type { EnabledAuthConfig } from '../auth/config';
import { walletTransport, WalletCoreError } from './http';

type Pin = { readonly document: string; readonly digest: `0x${string}` };
class CreationClientError extends Error {
  constructor(readonly code: 'creation/unavailable' | 'creation/invalid' | 'creation/expired' | 'creation/conflict' | 'creation/not-found' | 'creation/cap-too-low') {
    super(code); this.name = 'CreationClientError';
  }
}
function success(result: { status: number }) {
  if (result.status === 200) return;
  if (result.status === 400) throw new CreationClientError('creation/invalid');
  if (result.status === 404) throw new CreationClientError('creation/not-found');
  if (result.status === 409) throw new CreationClientError('creation/conflict');
  if (result.status === 410) throw new CreationClientError('creation/expired');
  if (result.status === 422) throw new CreationClientError('creation/cap-too-low');
  throw new CreationClientError('creation/unavailable');
}

/** Resource client only: no ceremony, polling, storage, account funding or broadcast.
 * A view reconstructs exact factory calldata and gas locally before a user can sign.
 * Captured Firebase session checks wrap every method in BrowserAuth.
 */
export function creationOperationClient(config: EnabledAuthConfig, getToken: () => Promise<string>, pin: Pin) {
  const trusted = Object.freeze({ ...pin }), profile = loadPinnedCreationProfile(trusted.document, trusted.digest);
  const environment = config.deployment;
  if (config.mode !== 'firebase' || config.webOrigin !== environment.web_origin) throw new WalletCoreError('wallet/unavailable');
  const scope = Object.freeze({ rpId: environment.webauthn_rp_id, origin: environment.web_origin });
  const account = Object.freeze({ generation: String(profile.deployment.generation), contract_manifest_version: profile.deployment.manifest_id });
  function consent(input: CreationConsent) {
    const expected = Object.freeze({ ...input.expected, scope });
    if (input.expected.document !== trusted.document || input.expected.profileDigest !== trusted.digest
        || input.expected.scope.origin !== scope.origin || input.expected.scope.rpId !== scope.rpId) throw new CreationClientError('creation/invalid');
    const preparation = parseInitializationPreparation(input.preparation, expected);
    if (preparation.state !== 'authorized') throw new CreationClientError('creation/invalid');
    return Object.freeze({ preparation, expected });
  }
  function view(value: unknown, selected: CreationConsent) {
    try {
      const wire = structuredClone(value), preview = parseCreationPreview(wire, selected);
      return Object.freeze({ wire, preview });
    } catch { throw new CreationClientError('creation/invalid'); }
  }
  const path = (selected: CreationConsent) => `/account-initializations/${selected.preparation.initialization_id}/creation-operation`;
  return {
    async prepare(input: CreationConsent, maximumGasCharge: string, signal: AbortSignal) {
      const selected = consent(input), cap = parseCreationCapRequest({ maximum_gas_charge: maximumGasCharge });
      const result = await walletTransport(config, getToken, signal).request(path(selected), 'POST', { maximum_gas_charge: cap.toString() }, account);
      success(result); signal.throwIfAborted();
      const review = view(result.value, selected);
      if (review.preview.terms.maximumGasCharge !== cap) throw new CreationClientError('creation/invalid');
      return review;
    },
    async restore(input: CreationConsent, signal: AbortSignal) {
      const selected = consent(input);
      const result = await walletTransport(config, getToken, signal).request(path(selected), 'GET', {}, 'identity');
      success(result); signal.throwIfAborted(); return view(result.value, selected);
    },
    async authorize(input: CreationConsent, review: { wire: unknown }, proof: unknown, signal: AbortSignal) {
      const selected = consent(input), { preview } = view(review.wire, selected);
      if (preview.receipt.state !== 'authorized' && (preview.receipt.authorization_expired || Date.now() >= preview.receipt.expires_at * 1000)) throw new CreationClientError('creation/expired');
      const wireProof: unknown = structuredClone(proof);
      encodeWebAuthnAssertion({ scope, key: selected.preparation.public_key, challenge: preview.candidate.digest, response: parseInitializationProof(wireProof) });
      const result = await walletTransport(config, getToken, signal).request(`${path(selected)}/authorize`, 'POST', wireProof as object, account);
      success(result); signal.throwIfAborted();
      let receipt;
      try { receipt = parseCreationReceipt(result.value, { id: selected.preparation.initialization_id, userOpHash: preview.candidate.userOpHash,
        digest: preview.candidate.digest, expiresAt: preview.receipt.expires_at }); }
      catch { throw new CreationClientError('creation/invalid'); }
      if (receipt.state !== 'authorized') throw new CreationClientError('creation/invalid');
      return receipt;
    },
  };
}
