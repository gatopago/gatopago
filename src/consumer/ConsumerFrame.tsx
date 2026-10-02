'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import Screen from './Screen';
import { PrimaryNav } from './PrimaryNav';
import { CatGlyph } from '../marketing/CatGlyph';
import { PwaControls } from '../pwa/PwaControls';
import { isReloadBlocked, serverReloadBlocked, subscribeReloadGuard } from '../pwa/reload-guard';

/** Original consumer frame; Next owns navigation, V3 owns session and money. */
export function ConsumerFrame({ children, english: en, navigation = false, presentation = 'account' }: { children: ReactNode; english: boolean; navigation?: boolean; presentation?: 'account' | 'access' }) {
  const blocked = useSyncExternalStore(subscribeReloadGuard, isReloadBlocked, serverReloadBlocked);
  const suffix = en ? '?lang=en' : '';
  const access = presentation === 'access';
  const home = en ? '/en' : '/';
  return <div className={`consumer-ui${access ? ' consumer-ui--access' : ''}`} lang={en ? 'en' : 'es'}>
    <Screen withPrimaryNav={navigation} className={access ? 'auth-frame' : ''}>
      {access ? <header className="auth-brand">
        <Link href={home} className="brand-lockup" aria-label={en ? 'GatoPago home' : 'Inicio de GatoPago'}
          onNavigate={event => { if (isReloadBlocked()) event.preventDefault(); }} aria-disabled={blocked || undefined}>
          <CatGlyph className="auth-brand__symbol" decorative /><strong>GatoPago</strong>
        </Link>
      </header> : <header className="meli-app-header mb-6">
        <Link href={access ? home : `/app${suffix}`} className="meli-identity" aria-label={access ? (en ? 'GatoPago home' : 'Inicio de GatoPago') : (en ? 'My account' : 'Mi cuenta')}
          onNavigate={event => { if (isReloadBlocked()) event.preventDefault(); }} aria-disabled={blocked || undefined}>
          <span className="meli-avatar"><CatGlyph className="w-8" decorative /></span>
          <span className="min-w-0 leading-tight"><strong className="block font-display text-[15px]">GatoPago</strong>
            <small className="mt-1 block font-mono text-[10px] uppercase tracking-[0.08em] text-text-faint">{access ? (en ? 'Your digital dollars' : 'Tus dólares digitales') : (en ? 'Personal account' : 'Cuenta personal')}</small></span>
        </Link>
        <div className="flex items-center gap-2">
          <PwaControls english={en} compact />
          <Link href={access ? home : `/settings${suffix}`} className="meli-square-action h-11 w-11" aria-label={access ? (en ? 'Back to website' : 'Volver al sitio') : (en ? 'Settings' : 'Ajustes')}
            onNavigate={event => { if (isReloadBlocked()) event.preventDefault(); }} aria-disabled={blocked || undefined}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              {access ? <path d="m10 5-7 7 7 7M3 12h18" /> : <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="9" cy="18" r="2" /></>}
            </svg>
          </Link>
        </div>
      </header>}
      {children}
    </Screen>
    {navigation ? <PrimaryNav english={en} /> : null}
  </div>;
}
