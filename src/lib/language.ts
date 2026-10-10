export type Language = 'es' | 'en';

/** The language the visitor chose with a language switch; from then on, it wins over the browser. */
export const LANGUAGE_COOKIE = 'gatopago-language';

/** Spanish pages with an English twin under `/en`; every other page takes `?lang=en`. */
const ENGLISH_TWINS = new Set(['/', '/docs', '/privacy', '/terms', '/pay/demo-cafe-norte']);

/**
 * The language the browser prefers most, by its `q` weight (`en-US,es;q=0.9` prefers English);
 * `null` when it says nothing, as crawlers do: they keep the Spanish default.
 */
export function preferredLanguage(header: string | null): Language | null {
  let best: { tag: string; q: number } | null = null;
  for (const part of header?.split(',') ?? []) {
    const [tag, ...params] = part.trim().toLowerCase().split(';');
    if (!tag || tag === '*') continue;
    const weight = params.map((param) => param.trim()).find((param) => param.startsWith('q='));
    const q = weight ? Number(weight.slice(2)) : 1;
    if (Number.isFinite(q) && q > 0 && (!best || q > best.q)) best = { tag, q };
  }
  return best ? (best.tag.startsWith('es') ? 'es' : 'en') : null;
}

/** The English version of a page opened without a language, or `null` when it already is. */
export function englishLocation(pathname: string, search: URLSearchParams): string | null {
  if (pathname === '/en' || pathname.startsWith('/en/') || search.get('lang') === 'en') return null;
  if (ENGLISH_TWINS.has(pathname)) {
    const query = search.toString();
    return `${pathname === '/' ? '/en' : `/en${pathname}`}${query ? `?${query}` : ''}`;
  }
  const query = new URLSearchParams(search);
  query.set('lang', 'en');
  return `${pathname}?${query}`;
}

/** Keeps the visitor's choice for a year, so the next visit opens in it. */
export function rememberLanguage(language: Language) {
  const secure = location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `${LANGUAGE_COOKIE}=${language}; path=/; max-age=31536000; samesite=lax${secure}`;
}
