import type { ReactNode } from 'react';
import '@fontsource-variable/recursive/full.css';
import './base.css';
import '../consumer/consumer.css';
import '../auth/auth.css';
import { PwaBootstrap } from '../pwa/PwaBootstrap';
import { environment } from '../lib/brand';
import { headers } from 'next/headers';
import { NONCE_HEADER, validNonce } from '../security/nonce';
import { NonceProvider } from '../security/NonceProvider';

export async function Document({ lang, children }: { lang: 'es' | 'en'; children: ReactNode }) {
  const nonce = (await headers()).get(NONCE_HEADER);
  if (!validNonce(nonce)) throw new Error('The document security proxy did not run');
  return (
    <html lang={lang}>
      <body>
        <NonceProvider nonce={nonce}>
          <PwaBootstrap
            canonicalOrigin={environment.web_origin}
            release={process.env.NODE_ENV === 'production'}
          />
          {children}
        </NonceProvider>
      </body>
    </html>
  );
}
