'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { validNonce } from './nonce';

const NonceContext = createContext<string | null>(null);

export function NonceProvider({ nonce, children }: { nonce: string | null; children: ReactNode }) {
  const [documentNonce] = useState(nonce);
  return <NonceContext.Provider value={documentNonce}>{children}</NonceContext.Provider>;
}

export function useCspNonce(): string {
  const nonce = useContext(NonceContext);
  if (!validNonce(nonce)) throw new Error('Missing document CSP nonce');
  return nonce;
}
