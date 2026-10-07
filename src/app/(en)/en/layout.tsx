import type { ReactNode } from 'react';
import { Document } from '../../Document';
export { pwaMetadata as metadata, pwaViewport as viewport } from '../../../pwa/manifest';

/** English public pages: static, prerendered without a nonce (see `STATIC_PAGES`). */
export default function Layout({ children }: { children: ReactNode }) {
  return <Document lang="en">{children}</Document>;
}
