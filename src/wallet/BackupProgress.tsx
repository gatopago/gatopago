import type { parseBackupStatus } from '@gatopago/shared/v3/backup-status';

/** Historical evidence is displayed separately from current security and key possession. */
export default function BackupProgress({ progress: p, english: en }: {
  progress: ReturnType<typeof parseBackupStatus>; english: boolean;
}) {
  const o = p.observation, confirmed = p.policy_confirmation;
  const uncertain = o && (o.status !== 'observed' || o.finality !== 'finalized');
  const title = p.job_state === 'review' || o?.outcome === 'execution_reverted'
    ? (en ? 'Backup needs review' : 'La activación necesita revisión')
    : uncertain ? (en ? 'Latest network result is not confirmed' : 'El último resultado en red no está confirmado')
      : confirmed ? (en ? 'Installed policy recorded' : 'Política instalada registrada')
        : o?.status === 'observed' && o.finality === 'finalized'
          ? (en ? 'Transaction confirmation recorded' : 'Confirmación de transacción registrada')
          : p.delivery_state === 'expired' ? (en ? 'The sending window expired' : 'Venció el plazo de envío')
            : ['sending','uncertain','accepted'].includes(p.delivery_state)
              ? (en ? 'Tracking this transaction' : 'Seguimiento de esta transacción')
              : (en ? 'Consent recorded; waiting for delivery' : 'Consentimiento registrado; esperando entrega');
  const time = (v: number) => <time dateTime={new Date(v * 1000).toISOString()}>{new Date(v * 1000).toLocaleString(en ? 'en-US' : 'es-BO')}</time>;
  return <div role="status" className="creation-progress">
    <h5>{title}</h5>
    <p>{en ? 'Reading this status does not sign or resend anything. These records do not prove current account security or enable spending.'
      : 'Consultar este estado no firma ni reenvía nada. Estos registros no prueban la seguridad actual de la cuenta ni habilitan gasto.'}</p>
    {o ? <p>{en ? 'Latest network observation' : 'Última observación de red'}: {time(o.observed_at)}.</p> : null}
    {o?.evidence_expires_at ? <p>{en ? 'That observation was valid until' : 'Esa observación tenía validez hasta'}: {time(o.evidence_expires_at)}.</p> : null}
    {confirmed ? <p>{en ? 'Historical policy confirmation' : 'Confirmación histórica de política'}: {time(confirmed.recorded_at)}.
      {' '}{en ? 'Its evidence was valid until' : 'Su evidencia tenía validez hasta'}: {time(confirmed.evidence_expires_at)}.</p> : null}
    {p.job_state === 'review' ? <p>{en ? 'Do not create a replacement operation assuming this one failed. The recorded result requires review.'
      : 'No crees otra operación suponiendo que ésta falló. El resultado registrado requiere revisión.'}</p> : null}
    <p>{en ? 'Status read at' : 'Estado consultado a las'}: {time(p.snapshot_at)}.</p>
    {p.transaction_hash ? <details><summary>{en ? 'Transaction hash' : 'Hash de transacción'}</summary><code>{p.transaction_hash}</code></details> : null}
  </div>;
}
