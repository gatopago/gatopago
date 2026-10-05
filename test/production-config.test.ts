import { afterEach, describe, expect, it, vi } from 'vitest';
import { pwaManifest } from '../src/pwa/manifest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('production Web configuration', () => {
  it('uses one product manifest', () => {
    expect(pwaManifest()).toMatchObject({
      name: 'GatoPago',
      short_name: 'GatoPago',
      id: '/app',
      scope: '/',
    });
  });
  it('reads origins and wallet networks', async () => {
    const { settings } = await import('../src/lib/settings');
    expect(settings.apiOrigin).toBe('https://api.gatopago.com');
    expect(settings.networks).toEqual(['eip155:421614', 'eip155:43113', 'eip155:10143']);
  });
  it.each([
    ['GATOPAGO_API_ORIGIN', ''],
    ['GATOPAGO_API_ORIGIN', 'https://api.gatopago.com/app'],
    ['GATOPAGO_WALLET_NETWORKS', 'eip155:1'],
    ['GATOPAGO_TURNSTILE_SITE_KEY', ''],
  ])('refuses to start with %s=%j', async (name, value) => {
    vi.stubEnv(name, value);
    await expect(import('../src/lib/settings')).rejects.toThrow();
  });
});
