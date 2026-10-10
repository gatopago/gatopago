'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';
import { rememberLanguage, type Language } from './language';

/** A language switch: it goes to the page in `language` and keeps that choice for next visits. */
export function LanguageLink({
  language,
  onClick,
  ...props
}: ComponentProps<typeof Link> & { language: Language }) {
  return (
    <Link
      {...props}
      hrefLang={language}
      onClick={(event) => {
        rememberLanguage(language);
        onClick?.(event);
      }}
    />
  );
}
