import { documentSecurityHeaders } from './content-policy';

/**
 * Pages prerendered and served from the CDN: the same for everyone, with no session and nothing a
 * visitor writes, so there is nothing to inject. Next's inline bootstrap scripts carry no nonce
 * there, so their policy allows inline scripts from this site only: no other origin and no eval.
 * Every other page renders per request with the nonce policy (`documentCsp`). A test keeps this
 * list equal to the pages under `app/(static)/[locale]`, in both languages.
 */
export const STATIC_PAGES: ReadonlySet<string> = new Set([
  '/',
  '/docs',
  '/privacy',
  '/terms',
  '/pay/demo-cafe-norte',
  '/en',
  '/en/docs',
  '/en/privacy',
  '/en/terms',
  '/en/pay/demo-cafe-norte',
]);

export function staticCsp({ development, secure }: { development: boolean; secure: boolean }) {
  return [
    "default-src 'none'",
    `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ''}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "style-src-attr 'unsafe-inline'",
    `connect-src 'self'${development ? ' ws://localhost:3000' : ''}`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(secure ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

/** The document's security headers, without "never cache": the CDN and the back button keep these. */
export const staticSecurityHeaders: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(documentSecurityHeaders).filter(([name]) => !name.endsWith('Cache-Control')),
);
