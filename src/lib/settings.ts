import { walletNetwork } from '@gatopago/shared/networks';

/** Settings that client components receive as props. */
export interface ClientSettings {
  readonly webOrigin: string;
  readonly apiOrigin: string;
  /** CAIP-2 ids of the networks wallets use. */
  readonly networks: readonly string[];
  /** Where balances are kept and sends start: one of `networks`, changeable by configuration. */
  readonly homeNetwork: string;
  /**
   * Optional RPC per network for the browser's reads (an Alchemy key restricted to this domain);
   * each falls back to the network's public RPC.
   */
  readonly rpcUrls: Readonly<Record<string, string>>;
  readonly turnstileSiteKey: string;
  /** Firebase web app and VAPID key for payment notifications; `null` hides them. */
  readonly push: {
    readonly firebase: Readonly<
      Record<'apiKey' | 'projectId' | 'messagingSenderId' | 'appId', string>
    >;
    readonly vapidKey: string;
  } | null;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function origin(name: string): string {
  const value = required(name);
  if (new URL(value).origin !== value) throw new Error(`${name} must be an origin`);
  return value;
}

const networks = required('GATOPAGO_WALLET_NETWORKS')
  .split(',')
  .map((id) => (walletNetwork(id.trim()), id.trim()));
const homeNetwork = required('GATOPAGO_HOME_NETWORK');
if (!networks.includes(homeNetwork))
  throw new Error('GATOPAGO_HOME_NETWORK must be a wallet network');

const rpcUrls: Record<string, string> = JSON.parse(
  process.env.GATOPAGO_WALLET_RPC_URLS?.trim() || '{}',
);
for (const [id, url] of Object.entries(rpcUrls))
  if (!networks.includes(id) || new URL(url).protocol !== 'https:')
    throw new Error(`GATOPAGO_WALLET_RPC_URLS: invalid entry for ${id}`);

function push(): ClientSettings['push'] {
  const firebase = process.env.GATOPAGO_FIREBASE_CONFIG?.trim();
  const vapidKey = process.env.GATOPAGO_FIREBASE_VAPID_KEY?.trim();
  if (!firebase || !vapidKey) return null;
  const config: Record<string, unknown> = JSON.parse(firebase);
  for (const key of ['apiKey', 'projectId', 'messagingSenderId', 'appId'])
    if (typeof config[key] !== 'string')
      throw new Error(`GATOPAGO_FIREBASE_CONFIG: missing ${key}`);
  return {
    firebase: {
      apiKey: config.apiKey as string,
      projectId: config.projectId as string,
      messagingSenderId: config.messagingSenderId as string,
      appId: config.appId as string,
    },
    vapidKey,
  };
}

/** Deployment settings, read once on the server; a missing or invalid one fails the build. */
export const settings = {
  webOrigin: origin('GATOPAGO_WEB_ORIGIN'),
  apiOrigin: origin('GATOPAGO_API_ORIGIN'),
  networks,
  homeNetwork,
  rpcUrls,
  turnstileSiteKey: required('GATOPAGO_TURNSTILE_SITE_KEY'),
  push: push(),
};

export const clientSettings: ClientSettings = {
  webOrigin: settings.webOrigin,
  apiOrigin: settings.apiOrigin,
  networks: settings.networks,
  homeNetwork: settings.homeNetwork,
  rpcUrls: settings.rpcUrls,
  turnstileSiteKey: settings.turnstileSiteKey,
  push: settings.push,
};
