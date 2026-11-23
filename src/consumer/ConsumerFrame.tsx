'use client';

import './consumer.css';
import '../auth/auth.css';
import { useState, type ReactNode } from 'react';
import { NavigationLink as Link } from './NavigationLink';
import Screen from './Screen';
import { PrimaryNav } from './PrimaryNav';
import { CatGlyph } from '../marketing/CatGlyph';
import { MenuSheet } from './MenuSheet';
import { ScanIcon } from './Icons';
import { walletNetwork } from '@gatopago/shared/networks';
import { useProfile } from '../wallet/useProfile';
import { useTopLevel } from './history';
import { useLocale, useTranslations } from 'next-intl';

/**
 * The page around every screen. The account's header and tab bar belong to its three main tabs;
 * the screens opened from them (send, settings…) get the whole height and a back button.
 * `access` is sign-in, `public` a page anyone opens (a checkout, a profile).
 */
type FrameProps = {
  children: ReactNode;
  navigation?: boolean;
  presentation?: 'account' | 'access' | 'public';
  account?: { networks: readonly string[]; businessOrigin: string };
};

export function ConsumerFrame(props: FrameProps) {
  // Only the account has main tabs, and telling them apart reads the address: pages without an
  // account skip it, so they can be prerendered.
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
  navigation = false,
  presentation = 'account',
  account,
  top,
}: FrameProps & { top: boolean }) {
  const t = useTranslations('ConsumerFrame');
  const locale = useLocale();
  const [menuOpen, setMenuOpen] = useState(false);
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
        {testnet ? (
          <small className="mt-0.5 block font-mono text-[11px] uppercase tracking-[0.08em] text-text-faint">
            Testnet
          </small>
        ) : null}
      </span>
    </>
  );
  return (
    <div className={`consumer-ui${access ? ' consumer-ui--access' : ''}`} lang={locale}>
      <Screen withPrimaryNav={tabs} className={access ? 'auth-frame' : ''}>
        {access || presentation === 'public' ? (
          <header className={access ? 'auth-brand' : 'auth-brand auth-brand--public'}>
            <Link href={locale === 'en' ? '/en' : '/'} className="brand-lockup">
              <CatGlyph className="auth-brand__symbol" decorative />
              <strong>GatoPago</strong>
            </Link>
          </header>
        ) : accountHeader ? (
          <header className="meli-app-header">
            {/* Your name opens your profile: the address and QR live in Receive. */}
            {account ? (
              <Link
                href="/profile"
                className="meli-identity interactive-surface"
                aria-label={t('myProfile')}
              >
                {identity}
              </Link>
            ) : (
              <span className="meli-identity">{identity}</span>
            )}
            <div className="flex items-center gap-2">
              {/* Paying with a QR is the most common way to pay in the region: it gets the top
                  corner on every main tab. Installing the app lives in the menu. */}
              {account ? (
                <Link href="/scan" className="meli-avatar scan-target" aria-label={t('scanQr')}>
                  <ScanIcon />
                </Link>
              ) : null}
              {account ? (
                <button
                  type="button"
                  onClick={() => setMenuOpen(true)}
                  className="meli-square-action h-11 w-11"
                  aria-label={t('openMenu')}
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
      {tabs ? <PrimaryNav /> : null}
      {menuOpen && account ? (
        <MenuSheet businessOrigin={account.businessOrigin} onClose={() => setMenuOpen(false)} />
      ) : null}
    </div>
  );
}
