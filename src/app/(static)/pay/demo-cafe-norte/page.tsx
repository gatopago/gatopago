import type { Metadata } from 'next';
import { DemoPayment } from '../../../../marketing/DemoPayment';

export const metadata: Metadata = {
  title: 'Ejemplo de cobro · GatoPago',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <DemoPayment english={false} />;
}
