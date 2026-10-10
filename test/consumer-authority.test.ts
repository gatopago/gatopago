import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RecoveryScreen } from '../src/consumer/AccountScreens';
import { withTexts } from './translations';

vi.mock('next/navigation', async (original) => ({
  ...(await original<typeof import('next/navigation')>()),
  usePathname: () => '/settings/security/recovery',
  useRouter: () => ({ back: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

describe('Consumer authority: one key, optional equivalent backups, no guardian conversion', () => {
  it.each([false, true])(
    'explains permanent loss without promising support recovery (English=%s)',
    (english) => {
      const html = renderToStaticMarkup(
        withTexts(createElement(RecoveryScreen), english ? 'en' : 'es'),
      );
      expect(html).toContain(
        english ? 'access is lost permanently' : 'pierdes el acceso definitivamente',
      );
      expect(html).not.toContain(
        english ? 'Review my recovery policy' : 'Revisar mi política de recuperación',
      );
      expect(html).toContain(`href="${english ? '/en' : ''}/settings/security`);
    },
  );
});
