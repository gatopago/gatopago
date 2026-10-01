import { buildAuthConfig } from './config';
import { environment } from '../lib/brand';

// Server entry point. Public Firebase Web API key is not an Admin/service-account key.
export function webAuthConfig() {
  return buildAuthConfig(environment, {
    nodeEnv: process.env.NODE_ENV,
    localAuth: process.env.GATOPAGO_LOCAL_AUTH,
    apiKey: process.env.GATOPAGO_FIREBASE_WEB_API_KEY,
    appId: process.env.GATOPAGO_FIREBASE_WEB_APP_ID,
    turnstileSiteKey: process.env.GATOPAGO_TURNSTILE_SITE_KEY,
  });
}
