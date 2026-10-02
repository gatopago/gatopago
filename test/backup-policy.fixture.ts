import { createResourceId } from '@gatopago/shared/v3/primitives';
import { parseCredentialInventory } from '@gatopago/shared/v3/credential-inventory';
import { parseCredentialDetail } from '@gatopago/shared/v3/credential-detail';
import { initializationFixture } from '@gatopago/test-fixtures/v3-initialization';
import { backupWireFixture } from './backup.fixture';

/** Public, synthetic material only. No credential creation, external I/O or funded accounts. */
export function policyReviewFixture(count = 3) {
  const t = backupWireFixture(), consent = t.choice.consent, p = consent.preparation, scope = consent.expected.scope;
  const material = Array.from({ length: count }, (_, index) => {
    const id = index === 0 ? p.credential_ref : createResourceId('operation');
    return parseCredentialDetail({ scope, credential_ref: id,
      credential_id: index === 0 ? p.credential_id : Buffer.from(`synthetic-key-${index}`).toString('base64url'),
      public_key: index === 0 ? p.public_key : initializationFixture().input.publicKey,
      device_availability: 'unknown', onchain_authority: 'not_assessed' }, scope, id);
  });
  const inventory = parseCredentialInventory({ scope, data: material.map((row) => ({ credential_ref: row.credential_ref,
    created_at: Math.floor(Date.now() / 1000), transports: ['internal'], aaguid: '00000000-0000-0000-0000-000000000000',
    backup_eligible: true, backed_up_at_registration: true })), device_availability: 'unknown', onchain_authority: 'not_assessed' }, scope);
  return { t, consent, pin: t.f.pin, inventory, material, references: material.slice(1).map((row) => row.credential_ref) };
}
