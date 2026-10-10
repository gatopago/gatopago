import { privateMetadata } from '../../../../../lib/metadata';
import { AccountView } from '../../../../../auth/AccountShell';

export const generateMetadata = privateMetadata('settings');
export const dynamic = 'force-dynamic';

export default function Page() {
  return <AccountView view="settings" />;
}
