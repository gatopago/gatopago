import { environmentFromVariables } from '@gatopago/environment';

if (process.env.GATOPAGO_ENVIRONMENT !== 'production') {
  throw new Error('GatoPago Web supports only the production deployment environment');
}

export const environment = environmentFromVariables({
  GATOPAGO_ENVIRONMENT: process.env.GATOPAGO_ENVIRONMENT,
  GATOPAGO_WEB_ORIGIN: process.env.GATOPAGO_WEB_ORIGIN,
  GATOPAGO_API_ORIGIN: process.env.GATOPAGO_API_ORIGIN,
  GATOPAGO_BUSINESS_ORIGIN: process.env.GATOPAGO_BUSINESS_ORIGIN,
  GATOPAGO_WALLET_NETWORKS: process.env.GATOPAGO_WALLET_NETWORKS,
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
});
export const brand = { name: 'GatoPago', siteUrl: environment.web_origin } as const;
