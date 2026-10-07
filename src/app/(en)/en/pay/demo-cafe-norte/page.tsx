import type { Metadata } from 'next';
import { DemoPayment } from '../../../../../marketing/DemoPayment';

export const metadata: Metadata = {
  title: 'Payment example · GatoPago',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <DemoPayment english />;
}
