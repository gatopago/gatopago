import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseBackupStatus } from '@gatopago/shared/v3/backup-status';
import BackupProgress from '../src/wallet/BackupProgress';
import { backupWireFixture } from './backup.fixture';

function fixture() {
  const f = backupWireFixture(), c = f.commit(), time = f.f.input.validAfter;
  const expected = { backupId: f.choice.backupId, operationId: c.commitId, kind: 'commit' as const, proposalHash: f.compiled.digest };
  const progress = { schema_version: 1, backup_id: expected.backupId, operation_id: expected.operationId, kind: expected.kind,
    proposal_hash: expected.proposalHash, consent_state: 'authorized', delivery_state: 'uncertain', transaction_hash: `0x${'a'.repeat(64)}`,
    job_state: 'ready', reason: null, observation: null, policy_confirmation: null, account_readiness: 'not_assessed', snapshot_at: time + 100 };
  const observation = { epoch: 1, observed_at: time + 1, status: 'observed', finality: 'finalized', outcome: 'backup_committed',
    block_number: '102', block_hash: `0x${'b'.repeat(64)}`, evidence_expires_at: time + 30 };
  const confirmation = { manifest_hash: f.compiled.expectedManifestHash, recorded_at: time + 2, evidence_expires_at: time + 30, source_epoch: 1 };
  const render = (value: unknown, english = false) => renderToStaticMarkup(createElement(BackupProgress, { progress: parseBackupStatus(value, expected), english }));
  return { progress, observation, confirmation, render };
}
describe('Backup progress rendering: history is not spend readiness', () => {
  it('does not promote a transaction hash to confirmed backup', () => {
    const f = fixture(), html = f.render(f.progress);
    expect(html).toContain('Seguimiento de esta transacción'); expect(html).not.toContain('Política instalada registrada');
    expect(html).toContain('no prueban la seguridad actual'); expect(html).not.toContain('<button');
  });
  it('labels confirmed but expired evidence as historical, without a receive/spend action', () => {
    const f = fixture(), html = f.render({ ...f.progress, observation: f.observation, policy_confirmation: f.confirmation,
      job_state: 'observed', reason: 'commit_finalized' });
    expect(html).toContain('Confirmación histórica de política'); expect(html).toContain('tenía validez hasta');
    expect(html).not.toContain('<button'); expect(html).not.toContain('Cuenta lista');
  });
  it('prioritizes a newer unavailable result over historical policy confirmation, even if the job was observed', () => {
    const f = fixture(), html = f.render({ ...f.progress, job_state: 'observed', reason: 'commit_finalized', policy_confirmation: f.confirmation,
      observation: { ...f.observation, epoch: 2, status: 'unavailable', finality: 'not_assessed', outcome: null,
        block_number: null, block_hash: null, evidence_expires_at: null } });
    expect(html).toContain('El último resultado en red no está confirmado'); expect(html).toContain('Confirmación histórica');
    expect(html).not.toContain('<h5>Política instalada registrada');
  });
  it('renders review guidance in English without presenting uncertain work as failed', () => {
    const f = fixture(), html = f.render({ ...f.progress, job_state: 'review', reason: 'observation_timeout' }, true);
    expect(html).toContain('Backup needs review'); expect(html).toContain('Do not create a replacement');
    expect(html).toContain('does not sign or resend');
  });
});
