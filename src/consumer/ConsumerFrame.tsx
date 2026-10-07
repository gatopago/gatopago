'use client';

import './consumer.css';
import '../auth/auth.css';
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
import { useTopLevel } from './history';

const AccountDetails = dynamic(() =>
  import('./AccountDetailsSheet').then((m) => m.AccountDetailsSheet),
);

/**
 * The page around every screen. The account's header and tab bar belong to its four main tabs;
 * the screens opened from them (send, settings…) get the whole height and a back button.
 * `access` is sign-in, `public` a page anyone opens (a checkout, a profile).
 */
type FrameProps = {
  children: ReactNode;
  english: boolean;
  navigation?: boolean;
  presentation?: 'account' | 'access' | 'public';
  account?: { address: string; networks: readonly string[]; businessOrigin: string };
};

export function ConsumerFrame(props: FrameProps) {
  // Only the account has main tabs, and telling them apart reads the query (`/move?flow=receive`
  // is not one): pages without an account skip it, so they can be prerendered.
  return (props.presentation ?? 'account') === 'account' ? (
    <AccountFrame {...props} />
  ) : (
    <Frame {...props} top={false} />
  );
}

function AccountFrame(props: FrameProps) {
  return <Frame {...props} top={useTopLevel()} />;
}

function Frame({
  children,
  english: en,
  navigation = false,
  presentation = 'account',
  account,
  top,
}: FrameProps & { top: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { profile } = useProfile();
  const access = presentation === 'access';
  const accountHeader = presentation === 'account' && top;
  const tabs = navigation && top;
  const testnet = account?.networks.some((id) => walletNetwork(id).chain.testnet);
  const identity = (
    <>
      <span className="meli-avatar">
        <CatGlyph className="w-7" decorative />
      </span>
      <span className="min-w-0 leading-tight">
        <strong className="block truncate font-display text-[15px]">
          {profile?.username ? `@${profile.username}` : 'GatoPago'}
        </strong>
        <small className="mt-0.5 flex items-center gap-1.5 truncate whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.08em] text-text-faint">
          {en ? 'Personal account' : 'Cuenta personal'}
          {testnet ? (
            <span aria-hidden="true" className="hidden min-[390px]:inline">
              · Testnet
            </span>
          ) : null}
        </small>
      </span>
    </>
  );
  return (
    <div className={`consumer-ui${access ? ' consumer-ui--access' : ''}`} lang={en ? 'en' : 'es'}>
      <Screen withPrimaryNav={tabs} className={access ? 'auth-frame' : ''}>
        {access || presentation === 'public' ? (
          <header className={access ? 'auth-brand' : 'auth-brand auth-brand--public'}>
            <Link href={en ? '/en' : '/'} className="brand-lockup">
              <CatGlyph className="auth-brand__symbol" decorative />
              <strong>GatoPago</strong>
            </Link>
          </header>
        ) : accountHeader ? (
          <header className="meli-app-header">
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
              <span className="meli-identity">{identity}</span>
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
                  <svg
                    aria-hidden="true"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="square"
                  >
                    <path d="M4 7h16M4 12h16M4 17h16" />
                  </svg>
                </button>
              ) : null}
            </div>
          </header>
        ) : null}
        {children}
      </Screen>
      {tabs ? <PrimaryNav english={en} /> : null}
      {menuOpen && account ? (
        <MenuSheet
          english={en}
          businessOrigin={account.businessOrigin}
          onClose={() => setMenuOpen(false)}
        />
      ) : null}
      {detailsOpen && account ? (
        <AccountDetails
          address={account.address}
          english={en}
          onClose={() => setDetailsOpen(false)}
        />
      ) : null}
    </div>
  );
}
