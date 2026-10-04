export const consumerRoutes = {
  '/app': 'account',
  '/onboarding': 'onboarding',
  '/move': 'move',
  '/send': 'send',
  '/scan': 'scan',
  '/statement': 'activity',
  '/grow': 'grow',
  '/receive': 'receive',
  '/profile': 'profile',
  '/settings': 'settings',
  '/settings/security': 'security',
  '/settings/security/recovery': 'recovery',
} as const;
export type ConsumerView = 'login' | (typeof consumerRoutes)[keyof typeof consumerRoutes];

export function localizedPath(path: string, english: boolean): string {
  const url = new URL(path, 'https://gatopago.invalid');
  if (english) url.searchParams.set('lang', 'en');
  else url.searchParams.delete('lang');
  return url.pathname + url.search + url.hash;
}
