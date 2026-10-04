'use client';

import { NavigationLink as Link } from './NavigationLink';
import { usePathname } from 'next/navigation';
import { HomeIcon, MoveIcon, GrowIcon, ActivityIcon } from './Icons';

const destinations = [
  { href: '/app', es: 'Inicio', en: 'Home', icon: HomeIcon },
  { href: '/move', es: 'Mover', en: 'Move', icon: MoveIcon },
  { href: '/grow', es: 'Crecer', en: 'Grow', icon: GrowIcon },
  { href: '/statement', es: 'Envíos', en: 'Transfers', icon: ActivityIcon },
] as const;

/** Navigation to connected account features. */
export function PrimaryNav({ english: en }: { english: boolean }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={en ? 'Main navigation' : 'Navegación principal'}
      className="primary-nav fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[480px] px-2 pt-2 pb-[max(0.65rem,env(safe-area-inset-bottom))]"
    >
      <div className="grid grid-cols-4 gap-1">
        {destinations.map((item) => {
          const active =
            pathname === item.href ||
            (item.href === '/move' && ['/send', '/receive', '/scan'].includes(pathname));
          const className = `primary-nav__item relative flex min-h-13 flex-col items-center justify-center gap-1 text-[10px] font-semibold ${active ? 'is-active' : ''}`;
          const content = (
            <>
              <item.icon />
              <span>{en ? item.en : item.es}</span>
            </>
          );
          return (
            <Link
              key={item.es}
              href={`${item.href}${en ? '?lang=en' : ''}`}
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
