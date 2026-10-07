import type { Metadata } from 'next';
import { settings } from '../../../lib/settings';
import { DevelopersDocs } from '../../../marketing/DevelopersDocs';

export const metadata: Metadata = {
  title: 'Documentación del API · GatoPago',
  description: 'Cobra en USDC desde tu servidor: cobros, estados y webhooks firmados.',
};

export default function Page() {
  return (
    <DevelopersDocs
      apiOrigin={settings.apiOrigin}
      businessOrigin={settings.businessOrigin}
      english={false}
    />
  );
}
