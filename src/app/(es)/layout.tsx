import type { ReactNode } from 'react';
import { Document, requestNonce } from '../Document';
export { pwaMetadata as metadata, pwaViewport as viewport } from '../../pwa/manifest';

/** The app and every page that depends on the request: rendered per request, with a nonce CSP. */
export default async function Layout({ children }: { children: ReactNode }) {
  return (
    <Document lang="es" nonce={await requestNonce()}>
      {children}
    </Document>
  );
}
