import { buildAuthConfig } from './config';
import { environment } from '../lib/brand';

export function webAuthConfig() {
  return buildAuthConfig(environment, {
    nodeEnv: process.env.NODE_ENV,
    localAuth: process.env.GATOPAGO_LOCAL_AUTH,
    apiKey: process.env.GATOPAGO_FIREBASE_WEB_API_KEY,
    appId: process.env.GATOPAGO_FIREBASE_WEB_APP_ID,
    turnstileSiteKey: process.env.GATOPAGO_TURNSTILE_SITE_KEY,
  });
}
