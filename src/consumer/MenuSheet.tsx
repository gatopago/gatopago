'use client';

import { CatGlyph } from '../marketing/CatGlyph';
import {
  BusinessIcon,
  ChevronIcon,
  ContactsIcon,
  ProfileIcon,
  SecurityIcon,
  SettingsIcon,
  SupportIcon,
} from './Icons';
import { NavigationLink } from './NavigationLink';
import { Sheet } from './Sheet';
import { useTranslations } from 'next-intl';

export function MenuSheet({
  businessOrigin,
  onClose,
}: {
  /** GatoPago Business, the merchant console: its own site. */
  businessOrigin: string;
  onClose: () => void;
}) {
  const t = useTranslations('MenuSheet');
  const items = [
    { href: '/profile', label: t('profile'), icon: ProfileIcon, tone: 'brand' },
    { href: '/settings/security', label: t('security'), icon: SecurityIcon, tone: 'pending' },
    { href: '/contacts', label: t('contacts'), icon: ContactsIcon, tone: 'growth' },
    { href: '/settings', label: t('settings'), icon: SettingsIcon, tone: 'neutral' },
  ];
  return (
    <Sheet titleId="account-menu-title" onClose={onClose} variant="menu">
      <header className="mb-3 flex items-center justify-between gap-4 px-2">
        <h2 id="account-menu-title" className="brand-lockup text-[18px]">
          <CatGlyph className="w-6" decorative /> GatoPago
        </h2>
        <button
          type="button"
          data-sheet-close
          className="meli-square-action h-11 w-11"
          aria-label={t('closeMenu')}
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
      <nav aria-label={t('accountMenu')}>
        {items.map((item) => (
          <NavigationLink
            key={item.href}
            href={item.href}
            onClick={onClose}
            className="meli-menu-row"
          >
            <span className="meli-menu-row__icon" data-tone={item.tone}>
              <item.icon />
            </span>
            <span>{item.label}</span>
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
          {t('gatopagoBusiness')}
          <small className="block text-[12px] text-text-faint">{t('chargesApiKeysWebhooks')}</small>
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
        <span>{t('support')}</span>
        <ChevronIcon />
      </a>
    </Sheet>
  );
}
