import { stellarNetwork, walletNetwork } from '@gatopago/shared/networks';

/** Settings that client components receive as props. */
export interface ClientSettings {
  readonly webOrigin: string;
  readonly apiOrigin: string;
  /** GatoPago Business, the merchant console: where the menu, the landing and the docs send merchants. */
  readonly businessOrigin: string;
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
  /**
   * Offers Mera accounts (`GATOPAGO_MERA=on`): a key derived from the passkey owns the account and
   * signs without prompts during a short session.
   */
  readonly mera: boolean;
  /** Minutes a Mera signing session lasts without use (`GATOPAGO_MERA_SESSION_MINUTES`, 15). */
  readonly meraSessionMinutes: number;
  /**
   * The domain passkeys belong to (`GATOPAGO_PASSKEY_RP_ID`, by default this site's): fixed, since
   * a passkey and the keys Mera derives from it only exist for this domain and its subdomains.
   */
  readonly passkeyRpId: string;
  /**
   * Stellar, when this deployment shows it (`GATOPAGO_STELLAR_NETWORK`; Wallet Core needs it on
   * too): its CAIP-2 id and an optional RPC for the browser's reads. `null` hides it.
   */
  readonly stellar: { readonly network: string; readonly rpcUrl?: string } | null;
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

/** `GATOPAGO_PASSKEY_RP_ID`: this site's domain or a parent of it; by default the site's. */
function passkeyRpId(webOrigin: string): string {
  const host = new URL(webOrigin).hostname;
  const rpId = process.env.GATOPAGO_PASSKEY_RP_ID?.trim() || host;
  if (host !== rpId && !host.endsWith(`.${rpId}`))
    throw new Error('GATOPAGO_PASSKEY_RP_ID must be the site domain or a parent of it');
  return rpId;
}

function stellar(): ClientSettings['stellar'] {
  const network = process.env.GATOPAGO_STELLAR_NETWORK?.trim();
  if (!network) return null;
  stellarNetwork(network);
  const rpcUrl = process.env.GATOPAGO_STELLAR_RPC_URL?.trim();
  if (!rpcUrl) return { network };
  if (new URL(rpcUrl).protocol !== 'https:')
    throw new Error('GATOPAGO_STELLAR_RPC_URL must be an https URL');
  return { network, rpcUrl };
}

/** `GATOPAGO_BUSINESS_ORIGIN`, or by default this site's domain under `business.`. */
function businessOrigin(webOrigin: string): string {
  if (process.env.GATOPAGO_BUSINESS_ORIGIN?.trim()) return origin('GATOPAGO_BUSINESS_ORIGIN');
  const url = new URL(webOrigin);
  url.hostname = `business.${url.hostname}`;
  return url.origin;
}

const webOrigin = origin('GATOPAGO_WEB_ORIGIN');

function minutes(name: string, fallback: number): number {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 24 * 60)
    throw new Error(`${name} must be a whole number of minutes`);
  return parsed;
}

/** Deployment settings, read once on the server; a missing or invalid one fails the build. */
export const settings = {
  webOrigin,
  apiOrigin: origin('GATOPAGO_API_ORIGIN'),
  businessOrigin: businessOrigin(webOrigin),
  networks,
  homeNetwork,
  rpcUrls,
  turnstileSiteKey: required('GATOPAGO_TURNSTILE_SITE_KEY'),
  mera: process.env.GATOPAGO_MERA?.trim() === 'on',
  meraSessionMinutes: minutes('GATOPAGO_MERA_SESSION_MINUTES', 15),
  passkeyRpId: passkeyRpId(webOrigin),
  stellar: stellar(),
  push: push(),
};

export const clientSettings: ClientSettings = {
  webOrigin: settings.webOrigin,
  apiOrigin: settings.apiOrigin,
  businessOrigin: settings.businessOrigin,
  networks: settings.networks,
  homeNetwork: settings.homeNetwork,
  rpcUrls: settings.rpcUrls,
  turnstileSiteKey: settings.turnstileSiteKey,
  mera: settings.mera,
  meraSessionMinutes: settings.meraSessionMinutes,
  passkeyRpId: settings.passkeyRpId,
  stellar: settings.stellar,
  push: settings.push,
};
