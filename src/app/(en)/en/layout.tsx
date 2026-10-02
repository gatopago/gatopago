import type { ReactNode } from 'react';
import { Document } from '../../Document';
export { pwaMetadata as metadata, pwaViewport as viewport } from '../../../pwa/manifest';

export default function Layout({ children }: { children: ReactNode }) {
  return <Document lang="en">{children}</Document>;
}
