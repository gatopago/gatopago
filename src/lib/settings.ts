import { walletNetwork } from '@gatopago/shared/networks';

/** Settings that client components receive as props. */
export interface ClientSettings {
  readonly webOrigin: string;
  readonly apiOrigin: string;
  /** CAIP-2 ids of the networks wallets use, the first one for sign-in. */
  readonly networks: readonly string[];
  readonly turnstileSiteKey: string;
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

/** Deployment settings, read once on the server; a missing or invalid one fails the build. */
export const settings = {
  webOrigin: origin('GATOPAGO_WEB_ORIGIN'),
  apiOrigin: origin('GATOPAGO_API_ORIGIN'),
  businessOrigin: origin('GATOPAGO_BUSINESS_ORIGIN'),
  networks: required('GATOPAGO_WALLET_NETWORKS')
    .split(',')
    .map((id) => (walletNetwork(id.trim()), id.trim())),
  turnstileSiteKey: required('GATOPAGO_TURNSTILE_SITE_KEY'),
};

export const clientSettings: ClientSettings = {
  webOrigin: settings.webOrigin,
  apiOrigin: settings.apiOrigin,
  networks: settings.networks,
  turnstileSiteKey: settings.turnstileSiteKey,
};
