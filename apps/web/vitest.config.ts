import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { environment: 'node', include: ['test/**/*.test.ts'], env: {
  GATOPAGO_ENVIRONMENT: 'staging', GATOPAGO_WEB_ORIGIN: 'https://staging.gatopago.com',
  GATOPAGO_API_ORIGIN: 'https://api.staging.gatopago.com', GATOPAGO_BUSINESS_ORIGIN: 'https://business.staging.gatopago.com',
  GATOPAGO_WALLET_NETWORKS: 'eip155:421614', FIREBASE_PROJECT_ID: 'v3-runtime-test',
} } });
