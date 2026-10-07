import type { Metadata } from 'next';
import { settings } from '../../../../lib/settings';
import { DevelopersDocs } from '../../../../marketing/DevelopersDocs';

export const metadata: Metadata = {
  title: 'API documentation · GatoPago',
  description: 'Get paid in USDC from your server: charges, statuses and signed webhooks.',
};

export default function Page() {
  return (
    <DevelopersDocs
      apiOrigin={settings.apiOrigin}
      businessOrigin={settings.businessOrigin}
      english
    />
  );
}
