'use client';

import type { ReactNode } from 'react';
import { NavigationLink as Link } from './NavigationLink';
import Screen from './Screen';
import { PrimaryNav } from './PrimaryNav';
import { CatGlyph } from '../marketing/CatGlyph';
import { PwaControls } from '../pwa/PwaControls';

export function ConsumerFrame({
  children,
  english: en,
  navigation = false,
  presentation = 'account',
}: {
  children: ReactNode;
  english: boolean;
  navigation?: boolean;
  presentation?: 'account' | 'access';
}) {
  const suffix = en ? '?lang=en' : '';
  const access = presentation === 'access';
  return (
    <div className={`consumer-ui${access ? ' consumer-ui--access' : ''}`} lang={en ? 'en' : 'es'}>
      <Screen withPrimaryNav={navigation} className={access ? 'auth-frame' : ''}>
        {access ? (
          <header className="auth-brand">
            <Link href={en ? '/en' : '/'} className="brand-lockup">
              <CatGlyph className="auth-brand__symbol" decorative />
              <strong>GatoPago</strong>
            </Link>
          </header>
        ) : (
          <header className="meli-app-header mb-6">
            <Link
              href={`/app${suffix}`}
              className="meli-identity"
              aria-label={en ? 'My account' : 'Mi cuenta'}
            >
              <span className="meli-avatar">
                <CatGlyph className="w-8" decorative />
              </span>
              <span className="min-w-0 leading-tight">
                <strong className="block font-display text-[15px]">GatoPago</strong>
                <small className="mt-1 block font-mono text-[10px] uppercase tracking-[0.08em] text-text-faint">
                  {en ? 'Personal account' : 'Cuenta personal'}
                </small>
              </span>
            </Link>
            <div className="flex items-center gap-2">
              <PwaControls english={en} compact />
              <Link
                href={`/settings${suffix}`}
                className="meli-square-action h-11 w-11"
                aria-label={en ? 'Settings' : 'Ajustes'}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M4 6h16M4 12h16M4 18h16" />
                  <circle cx="9" cy="6" r="2" />
                  <circle cx="15" cy="12" r="2" />
                  <circle cx="9" cy="18" r="2" />
                </svg>
              </Link>
            </div>
          </header>
        )}
        {children}
      </Screen>
      {navigation ? <PrimaryNav english={en} /> : null}
    </div>
  );
}
