import { parseCredentialDetail } from '@gatopago/shared/v3/credential-detail';
import { parseResourceId } from '@gatopago/shared/v3/primitives';
import type { EnabledAuthConfig } from '../auth/config';
import { record, WalletCoreError, walletTransport } from './http';

class CredentialDetailError extends Error {
  constructor(readonly code: 'credentials/unavailable' | 'credentials/profile-required' | 'credentials/not-found') { super(code); }
}

export async function loadCredentialDetail(config: EnabledAuthConfig, token: () => Promise<string>, reference: string, signal: AbortSignal) {
  try {
    const id = parseResourceId('operation', reference);
    const result = await walletTransport(config, token, signal).request(`/security/credentials/${id}`, 'GET');
    if (result.status === 409 && record(result.value) && result.value.error_code === 'SESSION_REQUIRED') {
      throw new CredentialDetailError('credentials/profile-required');
    }
    if (result.status === 404) throw new CredentialDetailError('credentials/not-found');
    if (result.status !== 200) throw new CredentialDetailError('credentials/unavailable');
    const env = config.deployment;
    return parseCredentialDetail(result.value, { rpId: env.webauthn_rp_id, origin: env.web_origin }, id);
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof WalletCoreError || error instanceof CredentialDetailError) throw error;
    throw new CredentialDetailError('credentials/unavailable');
  }
}
