'use client';

import { useState, type ReactNode } from 'react';
import { NavigationLink as Link } from './NavigationLink';
import Screen from './Screen';
import { PrimaryNav } from './PrimaryNav';
import { CatGlyph } from '../marketing/CatGlyph';
import { PwaControls } from '../pwa/PwaControls';
import { MenuSheet } from './MenuSheet';
import dynamic from 'next/dynamic';
import { walletNetwork } from '@gatopago/shared/networks';
import { useProfile } from '../wallet/useProfile';

const AccountDetails = dynamic(() =>
  import('./AccountDetailsSheet').then((m) => m.AccountDetailsSheet),
);

export function ConsumerFrame({
  children,
  english: en,
  navigation = false,
  presentation = 'account',
  account,
}: {
  children: ReactNode;
  english: boolean;
  navigation?: boolean;
  presentation?: 'account' | 'access';
  account?: { address: string; networks: readonly string[] };
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { profile } = useProfile();
  const access = presentation === 'access';
  const testnet = account?.networks.some((id) => walletNetwork(id).chain.testnet);
  const initial = (profile?.username ?? profile?.display_name ?? '')[0];
  const identity = (
    <>
      <span className="meli-avatar">
        <CatGlyph className="w-8" decorative />
      </span>
      <span className="min-w-0 leading-tight">
        <strong className="block truncate font-display text-[15px]">
          {profile?.username ? `@${profile.username}` : 'GatoPago'}
        </strong>
        <small className="mt-1 flex items-center gap-1.5 truncate whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.08em] text-text-faint">
          {en ? 'Personal account' : 'Cuenta personal'}
          {testnet ? (
            <span aria-hidden="true" className="hidden min-[390px]:inline">
              · Alpha
            </span>
          ) : null}
        </small>
      </span>
    </>
  );
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
            {account ? (
              <button
                type="button"
                className="meli-identity interactive-surface"
                onClick={() => setDetailsOpen(true)}
                aria-label={en ? 'My account' : 'Mi cuenta'}
                aria-haspopup="dialog"
                aria-expanded={detailsOpen}
              >
                {identity}
                <svg
                  aria-hidden="true"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            ) : (
              <Link
                href={en ? '/app?lang=en' : '/app'}
                className="meli-identity"
                aria-label={en ? 'My account' : 'Mi cuenta'}
              >
                {identity}
              </Link>
            )}
            <div className="flex items-center gap-2">
              <PwaControls english={en} compact />
              {account ? (
                <button
                  type="button"
                  onClick={() => setMenuOpen(true)}
                  className="meli-avatar"
                  aria-label={en ? 'Open menu' : 'Abrir menú'}
                  aria-haspopup="dialog"
                  aria-expanded={menuOpen}
                >
                  {initial ? (
                    <span className="font-display text-[14px] font-bold uppercase">{initial}</span>
                  ) : (
                    <CatGlyph className="w-7" decorative />
                  )}
                </button>
              ) : null}
            </div>
          </header>
        )}
        {children}
      </Screen>
      {navigation ? <PrimaryNav english={en} /> : null}
      {menuOpen ? <MenuSheet english={en} onClose={() => setMenuOpen(false)} /> : null}
      {detailsOpen && account ? (
        <AccountDetails {...account} english={en} onClose={() => setDetailsOpen(false)} />
      ) : null}
    </div>
  );
}
