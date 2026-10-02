import type { Environment } from '@gatopago/environment';
import { ARBITRUM_SEPOLIA_CREATION } from '@gatopago/shared/v3/wallet-release';

export type CreationProfilePin = Readonly<{ document: string; digest: `0x${string}` }>;

export function creationProfileForRelease(environment: Environment): CreationProfilePin | null {
  return environment.wallet_enabled.includes('eip155:421614') ? ARBITRUM_SEPOLIA_CREATION : null;
}
