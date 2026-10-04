import { isLocalEnvironment, parseEnvironment, type Environment } from '@gatopago/environment';

export type WebAuthConfig =
  | { mode: 'disabled' }
  | {
      mode: 'firebase' | 'emulator';
      environment: 'production';
      deployment: Environment;
      webOrigin: string;
      firebase: { apiKey: string; appId: string; projectId: string; authDomain: string };
      apiOrigin: string | null;
      turnstileSiteKey: string | null;
    };
export type EnabledAuthConfig = Exclude<WebAuthConfig, { mode: 'disabled' }>;

export const LOCAL_AUTH_ORIGIN = 'http://127.0.0.1:9099';

export const LOCAL_WEB_ORIGIN = 'http://localhost:3000';
export const LOCAL_AUTH_PROJECT = 'demo-gatopago-v3';

export function buildAuthConfig(
  environment: Environment,
  input: {
    nodeEnv?: string;
    localAuth?: string;
    apiKey?: string;
    appId?: string;
    turnstileSiteKey?: string;
  },
): WebAuthConfig {
  const env = parseEnvironment(environment);
  if (input.localAuth && input.localAuth !== '1') throw new Error('Invalid local auth switch');
  if (input.localAuth === '1') {
    if (
      input.nodeEnv !== 'development' ||
      !isLocalEnvironment(env) ||
      env.web_origin !== LOCAL_WEB_ORIGIN
    ) {
      throw new Error('Auth emulator is development-only and cannot enter a release');
    }
    if (input.apiKey || input.appId || input.turnstileSiteKey)
      throw new Error('Do not mix local and remote auth');
    return {
      deployment: env,
      mode: 'emulator',
      environment: env.environment,
      webOrigin: LOCAL_WEB_ORIGIN,
      firebase: {
        apiKey: 'fake-api-key',
        projectId: LOCAL_AUTH_PROJECT,
        appId: '1:123456789:web:0000000000000000000000',
        authDomain: 'localhost',
      },
      apiOrigin: null,
      turnstileSiteKey: null,
    };
  }
  if (env.status !== 'provisioned') {
    if (input.apiKey || input.appId || input.turnstileSiteKey)
      throw new Error('Auth resources are not provisioned');
    return { mode: 'disabled' };
  }
  if (
    !input.apiKey ||
    !/^AIza[A-Za-z0-9_-]{35}$/.test(input.apiKey) ||
    !input.appId ||
    !/^1:[0-9]+:web:[a-f0-9]+$/.test(input.appId) ||
    !input.turnstileSiteKey ||
    !(
      /^0x[A-Za-z0-9_-]{10,100}$/.test(input.turnstileSiteKey) ||
      (isLocalEnvironment(env) && input.turnstileSiteKey === '1x00000000000000000000AA')
    ) ||
    !env.firebase_project_id ||
    env.firebase_project_id.startsWith('demo-')
  ) {
    throw new Error('Incomplete public Firebase/Turnstile configuration');
  }
  return {
    deployment: env,
    mode: 'firebase',
    environment: env.environment,
    webOrigin: env.web_origin,
    firebase: {
      apiKey: input.apiKey,
      appId: input.appId,
      projectId: env.firebase_project_id,
      authDomain: new URL(env.web_origin).hostname,
    },
    apiOrigin: `${env.api_origin}`,
    turnstileSiteKey: input.turnstileSiteKey,
  };
}

export function assertBrowserOrigin(config: EnabledAuthConfig, origin: string): void {
  if (origin !== config.webOrigin) throw new Error('Auth origin does not match this environment');
  if (
    config.mode === 'emulator' &&
    (origin !== LOCAL_WEB_ORIGIN ||
      config.firebase.projectId !== LOCAL_AUTH_PROJECT ||
      config.firebase.apiKey !== 'fake-api-key' ||
      config.apiOrigin !== null ||
      config.turnstileSiteKey !== null)
  ) {
    throw new Error('Invalid isolated emulator configuration');
  }
}

export function authHeaders() {
  const privateHeaders = [
    { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
    { key: 'CDN-Cache-Control', value: 'no-store' },
    { key: 'Vercel-CDN-Cache-Control', value: 'no-store' },
    { key: 'Referrer-Policy', value: 'no-referrer' },
  ];
  return ['/login', '/app/:path*', '/settings/:path*'].map((source) => ({
    source,
    headers: privateHeaders,
  }));
}
