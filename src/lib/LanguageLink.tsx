'use client';

import type { ComponentProps } from 'react';
import type { Locale } from 'next-intl';
import { rememberLanguage } from './language';

/**
 * A language switch: it keeps the choice for the next visits and loads the page in `language`
 * entirely, since the layout that holds the texts renders again in it. With `replace`, the page in
 * the other language takes this one's place in the history.
 */
export function LanguageLink({
  language,
  replace = false,
  onClick,
  ...props
}: Omit<ComponentProps<'a'>, 'hrefLang'> & { href: string; language: Locale; replace?: boolean }) {
  return (
    <a
      {...props}
      hrefLang={language}
      onClick={(event) => {
        rememberLanguage(language);
        onClick?.(event);
        if (replace && !event.defaultPrevented) {
          event.preventDefault();
          location.replace(props.href);
        }
      }}
    />
  );
}
