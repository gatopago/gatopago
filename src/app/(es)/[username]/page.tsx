import { privateMetadata } from '../../../lib/metadata';
import { notFound } from 'next/navigation';
import { PublicUsername } from '../../../consumer/PublicUsername';
import { clientSettings } from '../../../lib/settings';
export const generateMetadata = privateMetadata('publicProfile');
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ username: string }> }) {
  const { username: segment } = await params;
  // The segment arrives percent-encoded: `/@ana` is `%40ana`.
  const username = decodeURIComponent(segment);
  if (!/^@[a-zA-Z][a-zA-Z0-9_]{2,29}$/.test(username)) notFound();
  return (
    <PublicUsername
      key={username}
      username={username.slice(1).toLowerCase()}
      settings={clientSettings}
    />
  );
}
