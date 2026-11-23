'use client';

import { Link, useRouter } from '../i18n/navigation';
import { useSyncExternalStore, type ComponentProps } from 'react';
import { isReloadBlocked, serverReloadBlocked, subscribeReloadGuard } from '../pwa/reload-guard';
import { leadsElsewhere, navigateWithTransition } from './transition';

export function NavigationLink(props: ComponentProps<typeof Link>) {
  const blocked = useSyncExternalStore(subscribeReloadGuard, isReloadBlocked, serverReloadBlocked);
  const router = useRouter();
  return (
    <Link
      {...props}
      prefetch={false}
      aria-disabled={blocked || props['aria-disabled']}
      onNavigate={(event) => {
        if (isReloadBlocked()) return event.preventDefault();
        props.onNavigate?.(event);
        // Another screen: the app goes there itself, inside the browser's animation (a filter or a
        // sheet on the same screen changes at once, and a link to the other language is the switch's).
        const { href, replace, scroll = true, locale } = props;
        if (locale !== undefined || !leadsElsewhere(href)) return;
        event.preventDefault();
        navigateWithTransition(() =>
          replace ? router.replace(href, { scroll }) : router.push(href, { scroll }),
        );
      }}
    />
  );
}
