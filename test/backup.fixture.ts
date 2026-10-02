import { createResourceId } from '@gatopago/shared/v3/primitives';
import { parseInitializationPreparation } from '@gatopago/shared/v3/initialization-wire';
import { prepareBackupEnrollment, prepareBackupCommit } from '@gatopago/shared/v3/backup-enrollment';
import { backupFixture } from '@gatopago/test-fixtures/v3-backup';

export function backupWireFixture() {
  const f = backupFixture(), id = createResourceId('operation'), credentialRef = createResourceId('operation');
  const expected = { id, credentialRef, document: f.pin.document, profileDigest: f.pin.digest,
    userSaltCommitment: f.input.initialization.userSaltCommitment, scope: f.input.initialization.scope };
  const preparation = parseInitializationPreparation({ initialization_id: id, state: 'authorized', approval_digest: f.initial.digest,
    profile_sha256: f.pin.digest, account_deployed: false, receive_enabled: false, spend_enabled: false, credential_ref: credentialRef,
    credential_id: Buffer.from('synthetic-factor').toString('base64url'), public_key: f.input.initialization.publicKey,
    valid_after: f.input.initialization.validAfter, valid_until: f.input.initialization.validUntil }, expected);
  const choice = { consent: { preparation, expected }, backupId: createResourceId('operation'), walletId: createResourceId('wallet'),
    walletAccountId: createResourceId('walletAccount'), nextPolicy: f.input.nextPolicy, proposalValidUntil: f.input.proposalValidUntil };
  const compiled = prepareBackupEnrollment(f.input, f.input.validAfter);
  const receipt = { backup_id: choice.backupId, initialization_id: id, wallet_id: choice.walletId, wallet_account_id: choice.walletAccountId,
    state: 'prepared' as const, proposal_hash: compiled.digest, expected_manifest_hash: compiled.expectedManifestHash,
    valid_after: f.input.validAfter, valid_until: f.input.validUntil, proposal_valid_until: f.input.proposalValidUntil,
    backup_assessment: 'not_assessed' as const, receive_enabled: false as const, spend_enabled: false as const };
  const wire = { ...receipt, input: structuredClone(f.input) }, authorized = { ...receipt, state: 'authorized' as const };
  const parent = { wire: { ...wire, state: 'authorized' as const } };
  function commit(after = f.input.validAfter, until = after + 300) {
    const commitId = createResourceId('operation'), observation = f.pending(), compiled = prepareBackupCommit(f.input, observation, after, until, after);
    const receipt = { commit_id: commitId, backup_id: choice.backupId, proposal_hash: compiled.prepared.digest, commit_digest: compiled.digest,
      valid_after: after, valid_until: until, state: 'prepared' as const, backup_assessment: 'not_assessed' as const,
      receive_enabled: false as const, spend_enabled: false as const };
    return { commitId, compiled, receipt, authorized: { ...receipt, state: 'authorized' as const },
      wire: { ...receipt, input: structuredClone(f.input), observation } };
  }
  return { f, choice, compiled, receipt, wire, authorized, parent, commit };
}
