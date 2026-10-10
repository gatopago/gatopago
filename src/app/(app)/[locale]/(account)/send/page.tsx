import { privateMetadata } from '../../../../../lib/metadata';
import { AccountView } from '../../../../../auth/AccountShell';

export const generateMetadata = privateMetadata('send');
export const dynamic = 'force-dynamic';

export default function Page() {
  return <AccountView view="send" />;
}
