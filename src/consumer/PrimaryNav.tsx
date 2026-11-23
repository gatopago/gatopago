'use client';

import { NavigationLink as Link } from './NavigationLink';
import { usePathname } from '../i18n/navigation';
import { ActivityIcon, GrowIcon, HomeIcon } from './Icons';
import { useTranslations } from 'next-intl';

const destinations = [
  { href: '/app', key: 'home', icon: HomeIcon },
  { href: '/earn', key: 'grow', icon: GrowIcon },
  { href: '/statement', key: 'activity', icon: ActivityIcon },
] as const;

export function PrimaryNav() {
  const t = useTranslations('PrimaryNav');
  const pathname = usePathname();
  return (
    <nav
      aria-label={t('mainNavigation')}
      className="primary-nav fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[480px] px-2 pt-2 pb-[max(0.65rem,env(safe-area-inset-bottom))]"
    >
      <div className="grid grid-cols-3 gap-1">
        {destinations.map((item) => {
          const active = pathname === item.href;
          const className = `primary-nav__item relative flex min-h-13 flex-col items-center justify-center gap-1 text-[12px] font-semibold ${active ? 'is-active' : ''}`;
          const content = (
            <>
              {/* The active tab's block: one element, so it slides from tab to tab. */}
              {active ? <span className="primary-nav__indicator" aria-hidden="true" /> : null}
              {/* Its own piece in a change of screen, so the sliding block passes behind it. */}
              <span
                className="flex flex-col items-center gap-1"
                style={{ viewTransitionName: `tab-${item.key}` }}
              >
                <item.icon />
                <span>{t(item.key)}</span>
              </span>
            </>
          );
          return (
            <Link
              key={item.href}
              href={item.href}
              className={className}
              aria-current={active ? 'page' : undefined}
            >
              {content}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
