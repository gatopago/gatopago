'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePathname, useRouter } from '../i18n/navigation';
import { isReloadBlocked } from '../pwa/reload-guard';

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
  const query = useSearchParams().toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** Whether the next screen comes from the browser's own history (back, forward, a swipe). */
let traversing = false;

/**
 * Records the screen the app arrived at. Through the browser's history it may go back several
 * screens at once: the record goes back to that screen, wherever it is. Otherwise, going to the
 * screen just before is going back too (a link to the parent).
 */
export function record(screen: string, traversed = false): Direction {
  if (visited.at(-1) === screen) return direction;
  const back = traversed
    ? visited.lastIndexOf(screen)
    : visited.at(-2) === screen
      ? visited.length - 2
      : -1;
  if (back >= 0) {
    visited.length = back + 1;
    direction = 'back';
  } else {
    direction = next ?? (visited.length === 0 ? 'none' : isTab(screen) ? 'tab' : 'forward');
    visited.push(screen);
  }
  next = null;
  listeners.forEach((listener) => listener());
  return direction;
}

/** Keeps the record of visited screens; mounted once by the account's layout. */
export function useNavigationRecord(): Direction {
  const screen = useScreen();
  useEffect(() => {
    const traverse = () => (traversing = true);
    window.addEventListener('popstate', traverse);
    return () => window.removeEventListener('popstate', traverse);
  }, []);
  // Before paint, so the new screen enters from the right side.
  useLayoutEffect(() => {
    record(screen, traversing);
    traversing = false;
  }, [screen]);
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
export function useBack(fallback: string) {
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
      router.replace(fallback);
    }
  }, [router, screen, fallback]);
}

/** Whether this screen is one of the main tabs, which have the account's header and tab bar. */
export function useTopLevel() {
  return isTab(useScreen());
}
