import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'GatoPago — Ejemplo de cobro', robots: { index: false, follow: false } };
export default function Page() {
  return <main className="web-notice"><h1>Ejemplo de enlace de cobro</h1>
    <p>Este recibo ilustra la presentación de un cobro. Sus datos son de ejemplo y no corresponden a una solicitud de pago.</p>
    <p lang="en">This receipt illustrates a payment request. Its sample data does not represent an actual payment.</p>
    <Link href="/#receive">Volver a la demostración</Link>
  </main>;
}
