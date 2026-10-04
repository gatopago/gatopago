'use client';

import Link from 'next/link';
import { useSyncExternalStore, type ComponentProps } from 'react';
import { isReloadBlocked, serverReloadBlocked, subscribeReloadGuard } from '../pwa/reload-guard';

/** Preserve the monetary operation guard for every consumer navigation action. */
export function NavigationLink(props: ComponentProps<typeof Link>) {
  const blocked = useSyncExternalStore(subscribeReloadGuard, isReloadBlocked, serverReloadBlocked);
  return (
    <Link
      {...props}
      prefetch={false}
      aria-disabled={blocked || props['aria-disabled']}
      onNavigate={(event) => {
        if (isReloadBlocked()) event.preventDefault();
        else props.onNavigate?.(event);
      }}
    />
  );
}
