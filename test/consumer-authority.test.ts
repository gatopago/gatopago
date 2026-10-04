import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { prepareInitialization } from '@gatopago/shared/v3/initialization';
import { RecoveryScreen } from '../src/consumer/AccountScreens';
import { initializationFixture } from '@gatopago/test-fixtures/v3-initialization';

vi.mock('next/navigation', () => ({
  usePathname: () => '/settings/security/recovery',
  useSearchParams: () => new URLSearchParams(),
}));

describe('Consumer authority: one key, optional equivalent backups, no guardian conversion', () => {
  it.each([false, true])(
    'explains permanent loss without promising support recovery (English=%s)',
    (english) => {
      const html = renderToStaticMarkup(createElement(RecoveryScreen, { english }));
      expect(html).toContain(
        english ? 'access is lost permanently' : 'pierdes el acceso definitivamente',
      );
      expect(html).not.toContain(
        english ? 'Review my recovery policy' : 'Revisar mi política de recuperación',
      );
      expect(html).toContain('href="/settings/security');
    },
  );
  it('constructs active spend/admin authority from the initial passkey alone', () => {
    const f = initializationFixture(),
      initial = prepareInitialization(f.input);
    expect(initial.policy).toMatchObject({ mode: 'active', spendThreshold: 1, adminThreshold: 1 });
    expect(initial.policy.signers).toHaveLength(1);
    expect(initial.policy.signers[0].roles).toBe(3);
    expect(Object.keys(initial.policy)).not.toContain('recoveryThreshold');
  });
});
