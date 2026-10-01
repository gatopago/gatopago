import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'GatoPago — Ejemplo no cobrable', robots: { index: false, follow: false } };
export default function Page() {
  return <main className="web-notice"><h1>Ejemplo de link de cobro</h1>
    <p>Este enlace pertenece a la demostración de la landing. No es un PaymentIntent: no tiene dirección de depósito, no acepta pagos ni solicita una firma.</p>
    <p lang="en">This is a non-payable marketing example. Do not send funds.</p>
    <a href="/#receive">Volver a la demostración</a>
  </main>;
}
