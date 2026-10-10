import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // next-intl imports `next/navigation` without an extension, as a bundler resolves it.
    server: { deps: { inline: ['next-intl'] } },
    include: ['test/**/*.test.ts'],
    env: {
      GATOPAGO_WEB_ORIGIN: 'https://gatopago.com',
      GATOPAGO_API_ORIGIN: 'https://api.gatopago.com',
      GATOPAGO_WALLET_NETWORKS: 'eip155:421614,eip155:43113,eip155:10143',
      GATOPAGO_HOME_NETWORK: 'eip155:421614',
      GATOPAGO_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
    },
  },
});
