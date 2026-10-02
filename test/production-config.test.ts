import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pwaManifest } from '../src/pwa/manifest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('production Web configuration', () => {
  it('uses one product manifest while retaining the testnet funds warning', () => {
    expect(pwaManifest()).toMatchObject({ name: 'GatoPago', short_name: 'GatoPago', id: '/app', scope: '/' });
    expect(pwaManifest().description).toContain('no envíes fondos reales');
  });
  it('uses the production protocol namespace even for isolated local development', () => {
    const example = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
    expect(example).toContain('GATOPAGO_ENVIRONMENT=production');
  });
  it('uses the production namespace with synthetic credentials in CI', () => {
    const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
    expect(ci).toContain('GATOPAGO_ENVIRONMENT: production');
    expect(ci).toContain('FIREBASE_PROJECT_ID: v3-build-test');
  });
  it('accepts the production namespace without deriving URLs from a legacy manifest', async () => {
    vi.resetModules();
    const { environment } = await import('../src/lib/brand');
    expect(environment.environment).toBe('production');
    expect(environment.web_origin).toBe('https://gatopago.com');
    expect(environment.api_origin).toBe('https://api.gatopago.com');
    expect(environment.blockchain_tiers).toEqual(['testnet']);
  });
  it('rejects the removed deployment namespace before initializing Web', async () => {
    vi.resetModules(); vi.stubEnv('GATOPAGO_ENVIRONMENT', 'unsupported');
    await expect(import('../src/lib/brand')).rejects.toThrow('only the production');
  });
});
