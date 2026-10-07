import type { ReactNode } from 'react';
import { Document } from '../Document';
export { pwaMetadata as metadata, pwaViewport as viewport } from '../../pwa/manifest';

/**
 * Spanish public pages (landing, docs, legal, the payment example): the same for everyone, so they
 * are prerendered and served from the CDN, without a nonce (see `STATIC_PAGES`).
 */
export default function Layout({ children }: { children: ReactNode }) {
  return <Document lang="es">{children}</Document>;
}
