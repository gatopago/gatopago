'use client';

import { ConsumerFrame } from './ConsumerFrame';
import { BackHeader, IntegrationNotice, Panel, UnavailableAction } from './Primitives';
import { NavigationLink } from './NavigationLink';
import { localizedPath } from './routes';

export function PublicPayment({ kind, reference, english: en }: {
  kind: 'link' | 'crosschain' | 'status'; reference: string | null; english: boolean;
}) {
  return <ConsumerFrame english={en}><div className="auth-content">
    <BackHeader title={kind === 'status' ? en ? 'Payment status' : 'Estado del pago' : en ? 'Pay with GatoPago' : 'Pagar con GatoPago'} english={en} to={en ? '/en' : '/'} />
    <Panel><p className="meli-kicker mb-4">{kind === 'crosschain' ? en ? 'Cross-chain request' : 'Solicitud entre redes' : en ? 'Payment reference' : 'Referencia de pago'}</p>
      <p className="mb-5 break-all font-mono text-sm">{reference || (en ? 'No reference supplied' : 'Sin referencia')}</p>
      <IntegrationNotice english={en} />
      <p className="text-sm leading-relaxed">{en ? 'We have not verified this recipient, request or payment. No amount, destination or successful receipt is inferred from the URL.' : 'No verificamos este destinatario, solicitud ni pago. No se deduce un monto, destino ni comprobante exitoso desde la URL.'}</p>
      <UnavailableAction>{kind === 'status' ? en ? 'Check payment' : 'Consultar pago' : en ? 'Review payment' : 'Revisar pago'}</UnavailableAction>
    </Panel>
    <NavigationLink href={localizedPath('/login', en)} className="btn btn-ghost btn-block">{en ? 'Sign in to my account' : 'Entrar a mi cuenta'}</NavigationLink>
  </div></ConsumerFrame>;
}
