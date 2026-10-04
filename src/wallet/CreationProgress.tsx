import type { parseCreationPreview } from '@gatopago/shared/v3/creation-operation-wire';

type Lifecycle = ReturnType<typeof parseCreationPreview>['lifecycle'];
const messages = {
  projected: ['Cuenta creada', 'Account created'],
  review: ['La creación requiere revisión', 'Account creation needs review'],
  finalized: ['Confirmación onchain registrada', 'Onchain confirmation recorded'],
  observed: [
    'Operación observada: falta confirmar el resultado final',
    'Operation observed: final result pending',
  ],
  expired: ['Venció el plazo sin iniciar el envío', 'The window expired before sending'],
  sending: ['Entrega en curso', 'Delivery in progress'],
  tracking: ['Verificando el resultado en la red', 'Checking the result on the network'],
  queued: ['Autorización registrada: creación en cola', 'Authorization recorded: creation queued'],
  authorized: ['Autorización de creación registrada', 'Creation authorization recorded'],
} as const;
const reasons = {
  revoked: [
    'La autorización dejó de ser válida antes del envío. No se enviará con ese permiso.',
    'Authorization was revoked before delivery. It will not be sent with that permission.',
  ],
  execution_reverted: [
    'La ejecución revirtió. No equivale a una cuenta activada; puede haber cargos de red.',
    'Execution reverted. This is not an activated account; network charges may apply.',
  ],
  observation_timeout: [
    'No se logró confirmar el resultado dentro del plazo de seguimiento. No lo tratamos como un fallo definitivo ni reenviamos automáticamente.',
    'The result was not confirmed within the tracking window. This is not a definite failure and will not trigger an automatic resend.',
  ],
  processing_error: [
    'El seguimiento automático necesita revisión. No crees otra operación suponiendo que ésta falló.',
    'Automatic processing needs review. Do not create another operation assuming this one failed.',
  ],
} as const;
const finalityLabels = {
  not_assessed: ['sin evaluar', 'not assessed'],
  finalized: ['finalizada', 'finalized'],
  pending: ['pendiente', 'pending'],
  stale: ['evidencia vencida', 'expired evidence'],
  disagreement: ['fuentes en desacuerdo', 'sources disagree'],
  reorg_detected: ['cambio de bloque detectado', 'block change detected'],
  unavailable: ['no disponible', 'unavailable'],
} as const;

/** Historical evidence is labelled as such. Never renders a deposit address or
 * payment CTA; timestamps do not turn stale evidence into present readiness. */
export default function CreationProgress({
  lifecycle,
  delivery,
  checkedAt,
  english: en,
}: {
  lifecycle: Lifecycle | null;
  delivery: string;
  checkedAt: number | null;
  english: boolean;
}) {
  const o = lifecycle?.observation,
    b = lifecycle?.bootstrap;
  const key = b
    ? 'projected'
    : lifecycle?.job_state === 'review'
      ? 'review'
      : delivery === 'expired'
        ? 'expired'
        : o?.status === 'observed' && o.finality === 'finalized'
          ? 'finalized'
          : o?.status === 'observed'
            ? 'observed'
            : delivery === 'sending'
              ? 'sending'
              : ['accepted', 'uncertain'].includes(delivery)
                ? 'tracking'
                : lifecycle
                  ? 'queued'
                  : 'authorized';
  const reason = lifecycle?.reason,
    index = en ? 1 : 0;
  const time = (value: number) => (
    <time dateTime={new Date(value * 1000).toISOString()}>
      {new Date(value * 1000).toLocaleString(en ? 'en-US' : 'es-BO')}
    </time>
  );
  return (
    <div role="status" className="creation-progress">
      <h3>{messages[key][index]}</h3>
      {b ? (
        <p>
          {en
            ? 'Creation was confirmed. We are verifying receiving and finishing setup.'
            : 'La creación se confirmó. Estamos verificando la recepción y terminando la preparación.'}
        </p>
      ) : (
        <p>
          {en
            ? 'The server follows this same operation even if you leave this screen. Checking the status does not sign, send or create another account.'
            : 'El servidor sigue esta misma operación aunque salgas de esta pantalla. Consultar el estado no firma, envía ni crea otra cuenta.'}
        </p>
      )}
      {reason && reason in reasons ? <p>{reasons[reason as keyof typeof reasons][index]}</p> : null}
      <details>
        <summary>{en ? 'Creation record' : 'Comprobante de creación'}</summary>
        {b ? (
          <p>
            {en
              ? 'This historical result does not prove current account security or enable receiving and spending.'
              : 'Este resultado histórico no demuestra su seguridad actual ni habilita recibir y gastar.'}
          </p>
        ) : null}
        {o ? (
          <p>
            {en ? 'Last network observation' : 'Última observación de la red'}:{' '}
            {time(o.observed_at)}.{' '}
            {o.status === 'observed'
              ? (en ? 'Recorded finality' : 'Finalidad registrada') +
                ': ' +
                finalityLabels[o.finality][index]
              : en
                ? 'The latest check did not establish a confirmed result.'
                : 'La última comprobación no estableció un resultado confirmado.'}
          </p>
        ) : null}
        {o?.valid_until ? (
          <p>
            {en ? 'That evidence was valid until' : 'Esa evidencia tenía validez hasta'}:{' '}
            {time(o.valid_until)}.{' '}
            {en
              ? 'It is not a current spending authorization.'
              : 'No es una autorización actual para gastar.'}
          </p>
        ) : null}
        {b ? (
          <p>
            {en ? 'Initial configuration recorded' : 'Configuración inicial registrada'}:{' '}
            {time(b.recorded_at)}.
          </p>
        ) : null}
        {checkedAt !== null ? (
          <p>
            {en ? 'Status read at' : 'Estado consultado a las'}: {time(checkedAt)}.
          </p>
        ) : null}
        {o?.transaction_hash ? (
          <details>
            <summary>{en ? 'Observed transaction' : 'Transacción observada'}</summary>
            <code>{o.transaction_hash}</code>
          </details>
        ) : null}
      </details>
    </div>
  );
}
