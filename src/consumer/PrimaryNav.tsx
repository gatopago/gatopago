'use client';

import { NavigationLink as Link } from './NavigationLink';
import { usePathname } from 'next/navigation';
import { ActivityIcon, GrowIcon, HomeIcon, MoveIcon } from './Icons';
import { useLocale, useTranslations } from 'next-intl';
import { localizedPath } from './routes';

const destinations = [
  { href: '/app', key: 'home', icon: HomeIcon },
  { href: '/move', key: 'move', icon: MoveIcon },
  { href: '/earn', key: 'grow', icon: GrowIcon },
  { href: '/statement', key: 'activity', icon: ActivityIcon },
] as const;

export function PrimaryNav() {
  const t = useTranslations('PrimaryNav');
  const locale = useLocale();
  const pathname = usePathname();
  return (
    <nav
      aria-label={t('mainNavigation')}
      className="primary-nav fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[480px] px-2 pt-2 pb-[max(0.65rem,env(safe-area-inset-bottom))]"
    >
      <div className="grid grid-cols-4 gap-1">
        {destinations.map((item) => {
          const active =
            pathname === item.href ||
            (item.href === '/move' && ['/send', '/team', '/receive', '/scan'].includes(pathname));
          const className = `primary-nav__item relative flex min-h-13 flex-col items-center justify-center gap-1 text-[10px] font-semibold ${active ? 'is-active' : ''}`;
          const content = (
            <>
              <item.icon />
              <span>{t(item.key)}</span>
            </>
          );
          return (
            <Link
              key={item.href}
              href={localizedPath(item.href, locale)}
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
