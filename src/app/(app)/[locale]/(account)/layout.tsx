import type { ReactNode } from 'react';
import { AccountShell } from '../../../../auth/AccountShell';
import { clientSettings } from '../../../../lib/settings';

/** Every screen of the signed-in app shares one frame, mounted once. */
export default function AccountLayout({ children }: { children: ReactNode }) {
  return <AccountShell settings={clientSettings}>{children}</AccountShell>;
}
