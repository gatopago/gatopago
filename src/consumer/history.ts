'use client';

import { useCallback, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { isReloadBlocked } from '../pwa/reload-guard';
import { localizedPath } from './routes';

/** How the current screen was reached: it sets the direction of its entrance. */
type Direction = 'forward' | 'back' | 'tab' | 'none';

/** The screens visited in this tab, as far as the app saw them: back only goes where it came from. */
const visited: string[] = [];
let direction: Direction = 'none';
let next: Direction | null = null;
const listeners = new Set<() => void>();

const tabs = new Set(['/app', '/move', '/earn', '/statement']);
/**
 * A tab is told by its path: its filters (`/statement?type=sent`) keep it a tab. Only a subflow
 * inside one (`/move?flow=receive`) is a screen of its own, without the tab bar.
 */
const isTab = (screen: string) => {
  const [path, query = ''] = screen.split('?');
  return tabs.has(path) && !new URLSearchParams(query).has('flow');
};

/** A screen is its path and its query (`/move?flow=receive`), whatever the language. */
function useScreen() {
  const pathname = usePathname();
  const query = new URLSearchParams(useSearchParams());
  query.delete('lang');
  return query.size ? `${pathname}?${query}` : pathname;
}

function record(screen: string) {
  if (visited.at(-1) === screen) return;
  if (visited.at(-2) === screen) {
    visited.pop();
    direction = 'back';
  } else {
    direction = next ?? (visited.length === 0 ? 'none' : isTab(screen) ? 'tab' : 'forward');
    visited.push(screen);
  }
  next = null;
  listeners.forEach((listener) => listener());
}

/** Keeps the record of visited screens; mounted once by the account's layout. */
export function useNavigationRecord(): Direction {
  const screen = useScreen();
  // Before paint, so the new screen enters from the right side.
  useLayoutEffect(() => record(screen), [screen]);
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => direction,
    () => 'none',
  );
}

/**
 * Goes to the previous screen when the app came from it, as the browser's back does; a screen
 * opened directly (a link, a reload) goes to `fallback` instead, its parent.
 */
export function useBack(fallback: string, english: boolean) {
  const router = useRouter();
  const screen = useScreen();
  const leaving = useRef(false);
  return useCallback(() => {
    // A double tap goes back once; nothing leaves while an operation awaits its confirmation.
    if (leaving.current || isReloadBlocked()) return;
    leaving.current = true;
    setTimeout(() => (leaving.current = false), 600);
    if (visited.at(-1) === screen && visited.length > 1) router.back();
    else {
      // Opened directly: the parent replaces it, so the browser's back does not return here.
      visited.splice(0, visited.length);
      next = 'back';
      router.replace(localizedPath(fallback, english));
    }
  }, [router, screen, fallback, english]);
}

/** Whether this screen is one of the main tabs, which have the account's header and tab bar. */
export function useTopLevel() {
  return isTab(useScreen());
}
