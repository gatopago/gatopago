/** Consumer route inventory. Next owns routing; no nested SPA/router. */
export const consumerRoutes = {
  '/app': 'account', '/onboarding': 'onboarding', '/move': 'move',
  '/charge': 'charge', '/send': 'send', '/scan': 'scan', '/swap': 'swap',
  '/statement': 'activity', '/contacts': 'contacts', '/receive': 'receive',
  '/crosschain': 'crosschain', '/earn': 'earn', '/profile': 'profile',
  '/settings': 'settings', '/settings/security': 'security',
  '/settings/security/recovery': 'recovery', '/test-funds': 'test-funds',
} as const;
export type ConsumerView = 'login' | typeof consumerRoutes[keyof typeof consumerRoutes];

export const consumerAliases = {
  '/security': '/settings/security', '/recover': '/settings/security/recovery',
  '/deposit/binance': '/receive',
} as const;

export function localizedPath(path: string, english: boolean): string {
  const url = new URL(path, 'https://gatopago.invalid');
  if (english) url.searchParams.set('lang', 'en');
  else url.searchParams.delete('lang');
  return url.pathname + url.search + url.hash;
}
