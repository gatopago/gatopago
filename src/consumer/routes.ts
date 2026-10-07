export const consumerRoutes = {
  '/app': 'account',
  '/move': 'move',
  '/send': 'send',
  '/team': 'team',
  '/scan': 'scan',
  '/receive': 'receive',
  '/profile': 'profile',
  '/earn': 'earn',
  '/swap': 'swap',
  '/charge': 'charge',
  '/contacts': 'contacts',
  '/crosschain': 'crosschain',
  '/statement': 'statement',
  '/settings': 'settings',
  '/settings/security': 'security',
  '/settings/security/recovery': 'recovery',
  '/approve': 'approve',
} as const;
export type ConsumerView = 'login' | (typeof consumerRoutes)[keyof typeof consumerRoutes];

export function localizedPath(path: string, english: boolean): string {
  const url = new URL(path, 'https://gatopago.invalid');
  if (english) url.searchParams.set('lang', 'en');
  else url.searchParams.delete('lang');
  return url.pathname + url.search + url.hash;
}

/** Where to go after signing in: a path on this site only, never another origin. */
export function safeNext(value: string | null): string | null {
  return value && /^\/(?![/\\])\S*$/.test(value) && !value.startsWith('/login') ? value : null;
}
