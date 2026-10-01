'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { validNonce } from './nonce';

const NonceContext = createContext<string | null>(null);

/** Root layout survives SPA transitions: do not replace its nonce with a later Flight request's nonce. */
export function NonceProvider({ nonce, children }: { nonce: string; children: ReactNode }) {
  // router.refresh() may re-render the server layout without creating a new document.
  const [documentNonce] = useState(nonce);
  return <NonceContext.Provider value={documentNonce}>{children}</NonceContext.Provider>;
}

export function useCspNonce(): string {
  const nonce = useContext(NonceContext);
  if (!validNonce(nonce)) throw new Error('Missing document CSP nonce');
  return nonce;
}
