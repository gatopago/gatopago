import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/** Links and navigation in the page's language: `/send` is `/en/send` in English. */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
