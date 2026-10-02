import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { environment: 'node', include: ['test/**/*.test.ts'], env: {
  GATOPAGO_ENVIRONMENT: 'production', GATOPAGO_WEB_ORIGIN: 'https://gatopago.com',
  GATOPAGO_API_ORIGIN: 'https://api.gatopago.com', GATOPAGO_BUSINESS_ORIGIN: 'https://business.gatopago.com',
  GATOPAGO_WALLET_NETWORKS: 'eip155:421614', FIREBASE_PROJECT_ID: 'v3-runtime-test',
} } });
