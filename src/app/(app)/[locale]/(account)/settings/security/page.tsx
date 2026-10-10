import { privateMetadata } from '../../../../../../lib/metadata';
import { AccountView } from '../../../../../../auth/AccountShell';

export const generateMetadata = privateMetadata('security');
export const dynamic = 'force-dynamic';

export default function Page() {
  return <AccountView view="security" />;
}
