import type { Environment } from '@gatopago/environment';
import type { AccountContextPin } from './account-context';
import { ARBITRUM_SEPOLIA_DEPLOYMENT } from '@gatopago/shared/v3/wallet-release';

export function accountPinsForRelease(environment: Environment): readonly AccountContextPin[] {
  return environment.wallet_enabled.includes('eip155:421614') ? [ARBITRUM_SEPOLIA_DEPLOYMENT] : [];
}
