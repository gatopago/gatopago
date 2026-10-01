import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseCreationLifecycle } from '@gatopago/shared/v3/creation-lifecycle';
import { createResourceId } from '@gatopago/shared/v3/primitives';
import CreationProgress from '../src/wallet/CreationProgress';

const now = 1_800_000_000;
const receipt = { state: 'authorized' as const, delivery_state: 'accepted' };
const observation = () => ({ epoch: 1, observed_at: now, status: 'observed', finality: 'finalized', valid_until: now + 60,
  transaction_hash: `0x${'a'.repeat(64)}`, outcome: 'creation_succeeded' });
const value = () => ({ job_state: 'ready', reason: null, observation: observation(), bootstrap: null, account_readiness: 'not_assessed' });
const render = (v: unknown, en = false) => renderToStaticMarkup(createElement(CreationProgress, {
  lifecycle: parseCreationLifecycle(v, receipt, now + 3600), delivery: 'accepted', checkedAt: now + 3600, english: en }));

describe('creation progress: historical facts, not deposit permission', () => {
  it('renders finalized evidence with observation and validity dates, not a perpetual current-success badge', () => {
    const html = render(value());
    expect(html).toContain('Confirmación onchain registrada'); expect(html).toContain('validez hasta');
    expect(html).toContain('No es una autorización actual para gastar'); expect(html).not.toContain('<button');
  });
  it('renders recorded creation and links to fresh receiving verification', () => {
    const v = { ...value(), job_state: 'complete', reason: 'projected', bootstrap: { recorded_at: now, evidence_expires_at: now + 60,
      wallet_id: createResourceId('wallet'), wallet_account_id: createResourceId('walletAccount') } };
    expect(render(v)).toContain('Cuenta creada'); expect(render(v, true)).toContain('Account created');
    expect(render(v)).toContain('href="/profile"'); expect(render(v)).toContain('no demuestra su seguridad actual'); expect(render(v)).not.toContain('Copiar dirección');
  });
  it.each(['revoked', 'execution_reverted', 'observation_timeout', 'processing_error'])('renders review reason %s without retrying', (reason) => {
    const html = render({ ...value(), job_state: 'review', reason });
    expect(html).toContain('requiere revisión'); expect(html).not.toContain('<button');
  });
  it('a latest unavailable observation does not render a previous confirmation or unverified transaction hint', () => {
    const html = render({ ...value(), observation: { ...observation(), status: 'unavailable', finality: 'not_assessed', valid_until: null,
      transaction_hash: null, outcome: null } });
    expect(html).toContain('no estableció un resultado confirmado'); expect(html).not.toContain('Confirmación onchain registrada');
    expect(html).not.toContain('Transacción observada');
  });
  it.each(['extra', 'ready', 'epoch', 'future', 'expiry', 'unverified_hash', 'missing_outcome', 'job', 'bootstrap', 'prepared'])('rejects inconsistent lifecycle %s', (change) => {
    const v = value(); let selected: Parameters<typeof parseCreationLifecycle>[1] = receipt;
    if (change === 'extra') Object.assign(v, { lease_token: 'not-public' });
    if (change === 'ready') v.account_readiness = 'ready';
    if (change === 'epoch') v.observation.epoch = -1;
    if (change === 'future') v.observation.observed_at = now + 1;
    if (change === 'expiry') Object.assign(v.observation, { valid_until: null });
    if (change === 'unverified_hash') Object.assign(v.observation, { status: 'unavailable', finality: 'not_assessed', valid_until: null, outcome: null });
    if (change === 'missing_outcome') Object.assign(v.observation, { outcome: null });
    if (change === 'job') Object.assign(v, { job_state: 'complete', reason: 'processing_error' });
    if (change === 'bootstrap') Object.assign(v, { job_state: 'complete', reason: 'projected' });
    if (change === 'prepared') selected = { state: 'prepared', delivery_state: 'not_requested' };
    expect(() => parseCreationLifecycle(v, selected, now)).toThrow();
  });
});
