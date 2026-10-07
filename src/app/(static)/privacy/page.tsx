import type { Metadata } from 'next';
import { LegalDocument } from '../../../marketing/LegalDocument';

export const metadata: Metadata = {
  title: 'Política de Privacidad — GatoPago',
  robots: { index: false, follow: false },
};
export default function Page() {
  return <LegalDocument kind="privacy" lang="es" />;
}
