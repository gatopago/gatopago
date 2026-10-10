import type { Address, Hex } from 'viem';
import type { ClientSettings } from '../lib/settings';
import { api } from './api';
import type { Session } from './session';

/**
 * An access to GatoPago Business: the key a passkey derives for the console (not the money's),
 * approved once from the app by one of the account's owners.
 */
export interface BusinessKey {
  public_key: Hex;
  /** The account owner that approved it. */
  owner: Address;
  created_at: number;
}

/** The accounts' accesses to Business, newest first (`GET /app/v1/business-keys`). */
export const listBusinessKeys = (settings: ClientSettings, session: Session) =>
  api<{ keys: BusinessKey[] }>(settings.apiOrigin, 'business-keys', { token: session.token }).then(
    ({ keys }) => keys,
  );

/** Removes an access: that key no longer signs in, and its open console sessions end. */
export const removeBusinessKey = (settings: ClientSettings, session: Session, publicKey: Hex) =>
  api(settings.apiOrigin, `business-keys/${encodeURIComponent(publicKey)}`, {
    method: 'DELETE',
    token: session.token,
  });
