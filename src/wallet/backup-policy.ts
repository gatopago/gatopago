import { parseCredentialDetail, type CredentialDetail } from '@gatopago/shared/v3/credential-detail';
import { parseCredentialInventory, type CredentialInventory } from '@gatopago/shared/v3/credential-inventory';
import type { CreationConsent } from '@gatopago/shared/v3/creation-operation-wire';
import { parseInitializationPreparation } from '@gatopago/shared/v3/initialization-wire';
import { prepareInitialization } from '@gatopago/shared/v3/initialization';
import { hashSecurityPolicy, Role, SignerKind, signerId, type SecurityPolicy } from '@gatopago/shared/v3/security-policy';
import type { CreationProfilePin } from './creation-release';

const invalid = (): never => { throw Object.assign(new Error('Invalid policy selection'), { code: 'backup/invalid-selection' }); };
export function policySelection(consent: CreationConsent, inventory: CredentialInventory, references: readonly string[], pin: CreationProfilePin) {
  if (consent.expected.document !== pin.document || consent.expected.profileDigest !== pin.digest) return invalid();
  const expected = Object.freeze({ ...consent.expected, scope: Object.freeze({ ...consent.expected.scope }) });
  const preparation = parseInitializationPreparation(consent.preparation, expected);
  if (preparation.state !== 'authorized') return invalid();
  const listed = parseCredentialInventory(inventory, expected.scope);
  const refs = [preparation.credential_ref, ...references];
  if (refs.length < 2 || refs.length > 16 || new Set(refs).size !== refs.length ||
      refs.some((id) => !listed.data.some((row) => row.credential_ref === id))) return invalid();
  return Object.freeze({ consent: Object.freeze({ expected, preparation }), inventory: listed, references: Object.freeze(refs) });
}

/** Review of a passkey quorum, NOT a release-approved backup profile. Even
 * several physical authenticators share the RP dependency. Backup enrollment is optional; one existing key remains sufficient.
 */
export function passkeyPolicyDraft(selection: ReturnType<typeof policySelection>, material: readonly CredentialDetail[]) {
  const { consent, references } = selection, { expected, preparation } = consent;
  if (material.length !== references.length) return invalid();
  const details = references.map((id, index) => parseCredentialDetail(material[index], expected.scope, id));
  if (details[0].credential_id !== preparation.credential_id || details[0].public_key !== preparation.public_key ||
      new Set(details.map((row) => row.credential_id)).size !== details.length) return invalid();
  const initial = prepareInitialization({ document: expected.document, expectedDigest: expected.profileDigest,
    scope: expected.scope, publicKey: preparation.public_key, userSaltCommitment: expected.userSaltCommitment,
    validAfter: preparation.valid_after, validUntil: preparation.valid_until });
  const factors = details.map((credential) => {
    const descriptor = Object.freeze({ kind: SignerKind.WEBAUTHN, verifier: initial.profile.webauthn_verifier.address,
      verifierCodeHash: initial.profile.webauthn_verifier.runtime_code_hash, key: credential.public_key,
      roles: Role.SPEND | Role.ADMIN });
    return Object.freeze({ credential, descriptor, signerId: signerId(descriptor) });
  }).sort((a, b) => a.signerId < b.signerId ? -1 : a.signerId > b.signerId ? 1 : 0);
  const policy: SecurityPolicy = Object.freeze({ ...initial.policy, mode: 'active',
    signers: Object.freeze(factors.map((factor) => factor.descriptor)), spendThreshold: 1, adminThreshold: 1 });
  const hash = hashSecurityPolicy(policy); // Includes duplicate-physical-key and reachable-quorum checks.
  return Object.freeze({ profile: 'passkey-quorum' as const, policy, hash, factors: Object.freeze(factors), scope: Object.freeze({ ...expected.scope }),
    recoverableLostKeys: factors.length - policy.adminThreshold,
    independentExit: 'not_configured' as const, possession: 'not_assessed' as const,
    backupReady: false as const, onchainAuthority: 'not_assessed' as const });
}
