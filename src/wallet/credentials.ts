import { parseCredentialInventory } from '@gatopago/shared/v3/credential-inventory';
import type { EnabledAuthConfig } from '../auth/config';
import { record, WalletCoreError, walletTransport } from './http';

class CredentialInventoryError extends Error {
  constructor(readonly code: 'credentials/unavailable' | 'credentials/profile-required') {
    super(code);
  }
}

export async function loadCredentialInventory(
  config: EnabledAuthConfig,
  token: () => Promise<string>,
  signal: AbortSignal,
) {
  try {
    const result = await walletTransport(config, token, signal).request(
      '/security/credentials',
      'GET',
    );
    if (
      result.status === 409 &&
      record(result.value) &&
      result.value.error_code === 'SESSION_REQUIRED'
    ) {
      throw new CredentialInventoryError('credentials/profile-required');
    }
    if (result.status !== 200) throw new CredentialInventoryError('credentials/unavailable');
    const env = config.deployment;
    return parseCredentialInventory(result.value, {
      rpId: env.webauthn_rp_id,
      origin: env.web_origin,
    });
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof WalletCoreError || error instanceof CredentialInventoryError) throw error;
    throw new CredentialInventoryError('credentials/unavailable');
  }
}
