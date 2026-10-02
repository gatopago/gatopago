import { describe, expect, it, vi } from 'vitest';
import environments from '@gatopago/environment/environments.json';
import { environmentFromVariables, parseEnvironment } from '@gatopago/environment';
import { assertBrowserOrigin, authHeaders, buildAuthConfig, LOCAL_AUTH_PROJECT, LOCAL_WEB_ORIGIN, type EnabledAuthConfig } from '../src/auth/config';
import { createChallengeLifecycle, type ChallengeState } from '../src/auth/turnstile-lifecycle';

const staging = parseEnvironment(environments.staging);
const local = buildAuthConfig(staging, { nodeEnv: 'development', localAuth: '1' }) as EnabledAuthConfig;
const remoteEnvironment = { ...staging, status: 'provisioned' as const, firebase_project_id: 'gatopago-staging-test' };
const publicInputs = { apiKey: `AIza${'A'.repeat(35)}`, appId: '1:123456789:web:012345abcdef', turnstileSiteKey: `0x${'A'.repeat(22)}` };
const remote = buildAuthConfig(remoteEnvironment, publicInputs) as EnabledAuthConfig;

describe('V3 web auth environment', () => {
  it('does not invent Firebase resources for an unprovisioned environment', () => {
    const unprovisioned = { ...staging, status: 'unprovisioned' as const, firebase_project_id: null, wallet_enabled: [] };
    expect(buildAuthConfig(unprovisioned, {})).toEqual({ mode: 'disabled' });
    expect(() => buildAuthConfig(unprovisioned, publicInputs)).toThrow('not provisioned');
  });
  it.each(['production', 'test', undefined])('rejects emulator in %s', (nodeEnv) => {
    expect(() => buildAuthConfig(staging, { nodeEnv, localAuth: '1' })).toThrow('development-only');
  });
  it('rejects emulator for the production deployment environment even in development', () => {
    expect(() => buildAuthConfig(parseEnvironment(environments.production), { nodeEnv: 'development', localAuth: '1' })).toThrow();
  });
  it('uses one fixed demo project and loopback only', () => {
    expect(local.firebase.projectId).toBe(LOCAL_AUTH_PROJECT);
    expect(local.apiOrigin).toBeNull();
    expect(() => assertBrowserOrigin(local, LOCAL_WEB_ORIGIN)).not.toThrow();
    for (const origin of ['http://127.0.0.1:3000', 'http://localhost:3001', staging.web_origin, 'https://example.test']) {
      expect(() => assertBrowserOrigin(local, origin)).toThrow();
    }
    expect(() => assertBrowserOrigin({ ...local, firebase: { ...local.firebase, projectId: 'real-project' } }, LOCAL_WEB_ORIGIN)).toThrow();
  });
  it('rejects mixed, partial or malformed auth configuration', () => {
    expect(() => buildAuthConfig(staging, { localAuth: 'true' })).toThrow();
    expect(() => buildAuthConfig(staging, { nodeEnv: 'development', localAuth: '1', ...publicInputs })).toThrow('mix');
    for (const field of ['apiKey', 'appId', 'turnstileSiteKey'] as const) {
      expect(() => buildAuthConfig(remoteEnvironment, { ...publicInputs, [field]: '' })).toThrow();
    }
    expect(() => buildAuthConfig({ ...remoteEnvironment, firebase_project_id: LOCAL_AUTH_PROJECT }, publicInputs)).toThrow();
  });
  it('derives authDomain and the Wallet Core origin from the environment, not legacy hosts', () => {
    expect(remote.firebase.authDomain).toBe('staging.gatopago.com');
    expect(remote.apiOrigin).toBe('https://api.staging.gatopago.com');
    expect(() => assertBrowserOrigin(remote, 'https://gatopago.com')).toThrow();
  });
  it('uses local Web/API with real Firebase and restricts test Turnstile keys to loopback', () => {
    const deployment = environmentFromVariables({ GATOPAGO_ENVIRONMENT: 'staging',
      GATOPAGO_WEB_ORIGIN: 'http://localhost:3000', GATOPAGO_API_ORIGIN: 'http://localhost:8787',
      GATOPAGO_BUSINESS_ORIGIN: 'http://localhost:3000', GATOPAGO_WALLET_NETWORKS: 'eip155:421614',
      FIREBASE_PROJECT_ID: 'v3-local-test' });
    const inputs = { ...publicInputs, turnstileSiteKey: '1x00000000000000000000AA' };
    const config = buildAuthConfig(deployment, inputs) as EnabledAuthConfig;
    expect(config.mode).toBe('firebase');
    expect(config.apiOrigin).toBe('http://localhost:8787');
    expect(config.deployment.webauthn_rp_id).toBe('localhost');
    expect(() => assertBrowserOrigin(config, 'http://localhost:3000')).not.toThrow();
    expect(() => assertBrowserOrigin(config, 'http://localhost:3001')).toThrow();
    expect(() => buildAuthConfig(remoteEnvironment, inputs)).toThrow();
    expect(() => buildAuthConfig({ ...deployment, api_origin: 'https://api.example.org' }, inputs)).toThrow();
  });
  it('does not cache auth/account content', () => {
    const rules = authHeaders();
    expect(rules.map((rule) => rule.source)).toEqual(['/login', '/app/:path*', '/settings/:path*']);
    for (const rule of rules) {
      expect(rule.headers).toContainEqual({ key: 'Cache-Control', value: 'private, no-store, max-age=0' });
      expect(rule.headers).toContainEqual({ key: 'CDN-Cache-Control', value: 'no-store' });
      expect(rule.headers).toContainEqual({ key: 'Referrer-Policy', value: 'no-referrer' });
    }
  });
});

describe('Turnstile lifecycle (no external challenge)', () => {
  it.each(['expired', 'error'] as const)('invalidates a previously approved token on %s', (reason) => {
    const states: ChallengeState[] = [];
    const challenge = createChallengeLifecycle((state) => states.push(state));
    challenge.verified('one-use-token'); challenge.invalidate(reason); challenge.verified('late-token');
    expect(states).toEqual([{ status: 'verified', token: 'one-use-token' }, { status: reason, token: null }]);
  });
  it('ignores all callbacks after unmount and rejects empty tokens', () => {
    const publish = vi.fn(); const challenge = createChallengeLifecycle(publish);
    challenge.verified(''); expect(publish).toHaveBeenLastCalledWith({ status: 'error', token: null });
    publish.mockClear(); challenge.dispose(); challenge.invalidate('error'); challenge.verified('late');
    expect(publish).not.toHaveBeenCalled();
  });
});
