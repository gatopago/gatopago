import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { prepareInitialization } from '@gatopago/shared/v3/initialization';
import type { BrowserAuth } from '../src/auth/browser';
import BackupPolicyReview from '../src/wallet/BackupPolicyReview';
import { RecoveryScreen } from '../src/consumer/AccountScreens';
import { passkeyPolicyDraft, policySelection } from '../src/wallet/backup-policy';
import { policyReviewFixture } from './backup-policy.fixture';

vi.mock('next/navigation', () => ({ usePathname: () => '/settings/security/recovery', useSearchParams: () => new URLSearchParams() }));

describe('Consumer authority: one key, optional equivalent backups, no guardian conversion', () => {
  it.each([false, true])('explains permanent loss without promising support recovery (English=%s)', (english) => {
    const html = renderToStaticMarkup(createElement(RecoveryScreen, { english }));
    expect(html).toContain(english ? 'access is lost permanently' : 'pierdes el acceso definitivamente');
    expect(html).not.toContain(english ? 'Review my recovery policy' : 'Revisar mi política de recuperación');
    expect(html).toContain('href="/settings/security');
  });
  it('constructs active spend/admin authority from the initial passkey alone', () => {
    const f = policyReviewFixture(1), initial = prepareInitialization(f.t.f.input.initialization);
    expect(initial.policy).toMatchObject({ mode: 'active', spendThreshold: 1, adminThreshold: 1 });
    expect(initial.policy.signers).toHaveLength(1);
    expect(initial.policy.signers[0].roles).toBe(3);
    expect(Object.keys(initial.policy)).not.toContain('recoveryThreshold');
  });
  it('reviews equivalent backups without escalating thresholds or claiming onchain authorization', () => {
    const f = policyReviewFixture(2);
    const draft = passkeyPolicyDraft(policySelection(f.consent, f.inventory, f.references, f.pin), f.material);
    expect(draft.policy).toMatchObject({ spendThreshold: 1, adminThreshold: 1 });
    expect(draft.policy.signers.every((key) => key.roles === 3)).toBe(true);
    expect(draft).toMatchObject({ backupReady: false, onchainAuthority: 'not_assessed', independentExit: 'not_configured' });
  });
  it.each([false, true])('renders optional review without guardian controls, signing or I/O (English=%s)', (english) => {
    const f = policyReviewFixture(1), capture = vi.fn(), changed = vi.fn();
    const runtime = { credentialInventory: capture } as unknown as BrowserAuth;
    const html = renderToStaticMarkup(createElement(BackupPolicyReview, { runtime, uid: 'synthetic', consent: f.consent,
      inventory: f.inventory, pin: f.pin, english, onActiveChange: changed }));
    expect(html).toContain(english ? 'One passkey is sufficient' : 'Una passkey basta');
    expect(html).not.toMatch(/guardian|guardián|name=".*mode"/i);
    expect(capture).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled();
  });
});
