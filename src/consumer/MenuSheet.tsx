'use client';

import { CatGlyph } from '../marketing/CatGlyph';
import {
  BusinessIcon,
  ChevronIcon,
  ProfileIcon,
  SecurityIcon,
  SettingsIcon,
  SupportIcon,
} from './Icons';
import { NavigationLink } from './NavigationLink';
import { localizedPath } from './routes';
import { Sheet } from './Sheet';
import { useProfile } from '../wallet/useProfile';

export function MenuSheet({
  english: en,
  businessOrigin,
  onClose,
}: {
  english: boolean;
  /** GatoPago Business, the merchant console: its own site. */
  businessOrigin: string;
  onClose: () => void;
}) {
  const { profile } = useProfile();
  const initial = (profile?.username ?? profile?.display_name ?? '')[0];
  const items = [
    {
      href: '/settings/security',
      es: 'Seguridad',
      en: 'Security',
      icon: SecurityIcon,
      tone: 'pending',
    },
    {
      href: '/contacts',
      es: 'Contactos e invitaciones',
      en: 'Contacts and invitations',
      icon: ProfileIcon,
      tone: 'brand',
    },
    { href: '/settings', es: 'Ajustes', en: 'Settings', icon: SettingsIcon, tone: 'neutral' },
  ];
  return (
    <Sheet titleId="account-menu-title" onClose={onClose} variant="menu">
      <div className="sheet-handle mt-1 mb-3" aria-hidden="true" />
      <header className="mb-3 flex items-center justify-between gap-4 px-2">
        <h2 id="account-menu-title" className="brand-lockup text-[18px]">
          <CatGlyph className="w-6" decorative /> GatoPago
        </h2>
        <button
          type="button"
          data-sheet-close
          className="meli-square-action h-11 w-11"
          aria-label={en ? 'Close menu' : 'Cerrar menú'}
        >
          <svg
            aria-hidden="true"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </header>
      <NavigationLink
        href={localizedPath('/profile', en)}
        onClick={onClose}
        className="meli-menu-profile"
      >
        <span className="meli-avatar">
          {initial ? (
            <span className="font-display text-[15px] uppercase text-cat-300">{initial}</span>
          ) : (
            <CatGlyph className="w-8" decorative />
          )}
        </span>
        <span className="min-w-0">
          <strong className="block truncate text-[15px] font-normal">
            {profile?.display_name ||
              (profile?.username ? `@${profile.username}` : en ? 'My profile' : 'Mi perfil')}
          </strong>
          <span className="block truncate text-[12px] text-text-faint">
            {profile?.username
              ? `@${profile.username}`
              : en
                ? 'Choose your username'
                : 'Elige tu usuario'}
          </span>
        </span>
        <ChevronIcon />
      </NavigationLink>
      <nav aria-label={en ? 'Account menu' : 'Menú de cuenta'}>
        {items.map((item) => (
          <NavigationLink
            key={item.href}
            href={localizedPath(item.href, en)}
            onClick={onClose}
            className="meli-menu-row"
          >
            <span className="meli-menu-row__icon" data-tone={item.tone}>
              <item.icon />
            </span>
            <span>{en ? item.en : item.es}</span>
            <ChevronIcon />
          </NavigationLink>
        ))}
      </nav>
      <a
        href={businessOrigin}
        target="_blank"
        rel="noopener noreferrer"
        className="meli-menu-row"
        onClick={onClose}
      >
        <span className="meli-menu-row__icon" data-tone="info">
          <BusinessIcon />
        </span>
        <span>
          {en ? 'GatoPago Business' : 'GatoPago Negocios'}
          <small className="block text-[12px] text-text-faint">
            {en ? 'Charges, API keys and webhooks ↗' : 'Cobros, claves API y webhooks ↗'}
          </small>
        </span>
        <ChevronIcon />
      </a>
      <a
        href="https://t.me/danelerc"
        target="_blank"
        rel="noopener noreferrer"
        className="meli-menu-row"
        onClick={onClose}
      >
        <span className="meli-menu-row__icon" data-tone="info">
          <SupportIcon />
        </span>
        <span>{en ? 'Support' : 'Soporte'}</span>
        <ChevronIcon />
      </a>
    </Sheet>
  );
}
