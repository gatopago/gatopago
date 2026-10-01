'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { isReloadBlocked, serverReloadBlocked, subscribeReloadGuard } from '../pwa/reload-guard';

const destinations = [
  { href: '/app', es: 'Inicio', en: 'Home', paths: ['M3 11l9-8 9 8', 'M5 10v10h14V10', 'M9 20v-6h6v6'] },
  { href: '/move', es: 'Mover', en: 'Move', paths: ['M7 7h11', 'm15 4 3 3-3 3', 'M17 17H6', 'm9 14-3 3 3 3'] },
  { href: '/earn', es: 'Crecer', en: 'Grow', paths: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2'] },
  { href: '/statement', es: 'Actividad', en: 'Activity', paths: ['M3 3v18h18', 'm7 15 4-4 3 3 5-6'] },
] as const;

/** Port of client PrimaryNav: same four destinations, no body portal or React Router. */
export function PrimaryNav({ english: en }: { english: boolean }) {
  const pathname = usePathname();
  const blocked = useSyncExternalStore(subscribeReloadGuard, isReloadBlocked, serverReloadBlocked);
  return <nav aria-label={en ? 'Main navigation' : 'Navegación principal'} className="primary-nav fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[480px] px-2 pt-2 pb-[max(0.65rem,env(safe-area-inset-bottom))]">
    <div className="grid grid-cols-4 gap-1">{destinations.map(item => {
      const active = pathname === item.href || (item.href === '/move' && ['/send', '/receive', '/charge', '/swap', '/scan', '/crosschain'].includes(pathname));
      const className = `primary-nav__item relative flex min-h-13 flex-col items-center justify-center gap-1 text-[10px] font-semibold ${active ? 'is-active' : ''}`;
      const content = <><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{item.paths.map(path => <path key={path} d={path} />)}</svg><span>{en ? item.en : item.es}</span></>;
      return <Link key={item.es} href={`${item.href}${en ? '?lang=en' : ''}`} prefetch={false} className={className}
        aria-current={active ? 'page' : undefined} aria-disabled={blocked || undefined}
        onNavigate={event => { if (isReloadBlocked()) event.preventDefault(); }}>{content}</Link>;
    })}</div>
  </nav>;
}
