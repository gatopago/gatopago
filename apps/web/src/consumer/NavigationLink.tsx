'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';
import { isReloadBlocked } from '../pwa/reload-guard';

/** Preserve the monetary operation guard for every consumer navigation action. */
export function NavigationLink(props: ComponentProps<typeof Link>) {
  return <Link {...props} prefetch={false} onNavigate={event => {
    if (isReloadBlocked()) event.preventDefault();
    else props.onNavigate?.(event);
  }} />;
}
