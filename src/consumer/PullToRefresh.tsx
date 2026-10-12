'use client';

import { useEffect, useRef, useState } from 'react';
import { isReloadBlocked } from '../pwa/reload-guard';
import { refreshScreens } from '../wallet/push';
import { RefreshIcon } from './Icons';

/**
 * A pull is half the finger's travel: it counts from 64 px and stops at 96. The card follows the
 * finger (twice the pull), so while refreshing it rests below the screen's header.
 */
const RESISTANCE = 0.5;
const THRESHOLD = 64;
const MAX = 96;
/** Movement before deciding whether the gesture is a pull (down) or something else. */
const DEAD_ZONE = 8;

/**
 * Pull down at the top of a screen to read balances and activity again, as a movement
 * notification does. An installed app has no browser around it to reload, and a reload would also
 * end the signing session. The scanner, with its own gestures, passes `disabled`.
 */
export function PullToRefresh({ disabled = false }: { disabled?: boolean }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const gesture = useRef<{ x: number; y: number; pulling: boolean } | null>(null);
  const distance = useRef(0);

  useEffect(() => {
    // In a browser tab its own pull (a full reload) gives way to this one.
    const root = document.documentElement;
    const previous = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = 'contain';
    return () => {
      root.style.overscrollBehaviorY = previous;
    };
  }, []);

  useEffect(() => {
    if (disabled || refreshing) return;
    const start = (event: TouchEvent) => {
      const touch = event.touches[0];
      gesture.current =
        event.touches.length === 1 &&
        window.scrollY <= 0 &&
        !document.querySelector('dialog[open]') &&
        !scrolledInside(event.target) &&
        !isReloadBlocked()
          ? { x: touch.clientX, y: touch.clientY, pulling: false }
          : null;
      distance.current = 0;
    };
    const move = (event: TouchEvent) => {
      const current = gesture.current;
      if (!current) return;
      const dx = event.touches[0].clientX - current.x;
      const dy = event.touches[0].clientY - current.y;
      if (!current.pulling) {
        if (Math.abs(dx) + Math.abs(dy) < DEAD_ZONE) return;
        // Sideways or up is not a pull.
        if (dy <= 0 || Math.abs(dx) > dy) {
          gesture.current = null;
          return;
        }
        current.pulling = true;
      }
      distance.current = Math.min(Math.max(dy * RESISTANCE, 0), MAX);
      setPull(distance.current);
    };
    const end = () => {
      if (!gesture.current) return;
      gesture.current = null;
      if (distance.current < THRESHOLD) {
        setPull(0);
        return;
      }
      setRefreshing(true);
      refreshScreens();
      // Each screen shows its own loading; the indicator only confirms the pull was taken.
      setTimeout(() => {
        setRefreshing(false);
        setPull(0);
      }, 800);
    };
    document.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('touchmove', move, { passive: true });
    document.addEventListener('touchend', end);
    document.addEventListener('touchcancel', end);
    return () => {
      document.removeEventListener('touchstart', start);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', end);
      document.removeEventListener('touchcancel', end);
    };
  }, [disabled, refreshing]);

  if (pull === 0 && !refreshing) return null;
  const offset = refreshing ? THRESHOLD : pull;
  return (
    <div
      className="pull-refresh"
      data-ready={offset >= THRESHOLD}
      data-busy={refreshing}
      style={{ transform: `translate(-50%, ${offset * 2}px)` }}
      aria-hidden="true"
    >
      <span style={{ transform: `rotate(${offset * 4}deg)` }}>
        <RefreshIcon />
      </span>
    </div>
  );
}

/** Whether the touch began inside something scrolled down on its own, such as a list in a sheet. */
function scrolledInside(target: EventTarget | null) {
  for (
    let node = target instanceof Element ? target : null;
    node && node !== document.body;
    node = node.parentElement
  )
    if (node.scrollTop > 0) return true;
  return false;
}
