import type { Metadata } from 'next';
import { LegalDocument } from '../../../../marketing/LegalDocument';

export const metadata: Metadata = {
  title: 'Terms of Service — GatoPago',
  robots: { index: false, follow: false },
};
export default function Page() {
  return <LegalDocument kind="terms" lang="en" />;
}
