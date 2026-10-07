import type { ReactNode } from 'react';
import localFont from 'next/font/local';
import './base.css';
import { PwaBootstrap } from '../pwa/PwaBootstrap';
import { settings } from '../lib/settings';
import { headers } from 'next/headers';
import { NONCE_HEADER, validNonce } from '../security/nonce';
import { NonceProvider } from '../security/NonceProvider';

/**
 * Recursive with every axis (weight, MONO, CASL, slnt, CRSV), Latin only: served from this site,
 * preloaded, and with a fallback of the same metrics so text does not jump when it arrives.
 */
const recursive = localFont({
  src: '../../node_modules/@fontsource-variable/recursive/files/recursive-latin-full-normal.woff2',
  variable: '--font-recursive',
  weight: '300 1000',
  display: 'swap',
});

/** The CSP nonce the proxy gave this request. Reading it renders the page on every request. */
export async function requestNonce(): Promise<string> {
  const nonce = (await headers()).get(NONCE_HEADER);
  if (!validNonce(nonce)) throw new Error('The document security proxy did not run');
  return nonce;
}

/**
 * The page around every route. App pages pass the request's `nonce`; static pages (landing, docs,
 * legal) are prerendered without one and get the proxy's static policy (`STATIC_PAGES`).
 */
export function Document({
  lang,
  nonce = null,
  children,
}: {
  lang: 'es' | 'en';
  nonce?: string | null;
  children: ReactNode;
}) {
  return (
    <html lang={lang} className={recursive.variable}>
      <body>
        <NonceProvider nonce={nonce}>
          <PwaBootstrap
            canonicalOrigin={settings.webOrigin}
            release={process.env.NODE_ENV === 'production'}
          />
          {children}
        </NonceProvider>
      </body>
    </html>
  );
}
