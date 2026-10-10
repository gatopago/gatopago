import { privateMetadata } from '../../../../lib/metadata';
import { notFound } from 'next/navigation';
import { clientSettings } from '../../../../lib/settings';
import { Checkout } from '../../../../wallet/Checkout';

export const generateMetadata = privateMetadata('pay');
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^pi_[0-9a-f]{32}$/.test(id)) notFound();
  return <Checkout key={id} id={id} settings={clientSettings} />;
}
