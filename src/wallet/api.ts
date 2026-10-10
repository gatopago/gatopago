import type { Address, Hex } from 'viem';
import { currentSession, signOut } from './session';

/** A Wallet Core error: its `error_code`, or `NETWORK_ERROR` when it could not be reached. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export interface Profile {
  user_id: string;
  address: Address;
  username: string | null;
  display_name: string | null;
  social_url: string | null;
}

export interface Recipient {
  username: string;
  display_name: string | null;
  social_url: string | null;
  address: Address;
  /** Their account on Stellar, once Wallet Core registered it (within a minute of joining). */
  stellar_address: string | null;
}

export interface Approvals {
  initial_owners: Hex[] | null;
  approvals: { sequence: number; call: Hex; signature: Hex }[];
}

/**
 * Calls the GatoPago API: a relative `path` is Wallet Core's (`/app/v1/<path>`), an absolute one
 * another service on the same origin (Flow's `/v1/…` and `/checkout/v1/…`).
 */
export async function api<T>(
  apiOrigin: string,
  path: string,
  init: {
    method?: string;
    body?: unknown;
    token?: string;
    signal?: AbortSignal;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  let response: Response;
  const timeout = AbortSignal.timeout(20_000);
  try {
    response = await fetch(
      path.startsWith('/') ? `${apiOrigin}${path}` : `${apiOrigin}/app/v1/${path}`,
      {
        method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
        headers: {
          Accept: 'application/json',
          ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
          ...init.headers,
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        credentials: 'omit',
        cache: 'no-store',
        signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
      },
    );
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ApiError(0, 'NETWORK_ERROR');
  }
  // Every answer of Wallet Core and Flow is a JSON object: anything else (a proxy's error page, a
  // cut connection, `null`) is a failure of its own, never an empty success. The console's client
  // applies the same rule.
  const value = await response.json().catch(() => undefined);
  // An expired or revoked session signs out and the app returns to sign-in; a late answer to an
  // earlier session (another account since, or replaced) leaves the one in use alone.
  if (response.status === 401 && init.token && init.token === currentSession()?.token) signOut();
  if (!response.ok) throw new ApiError(response.status, value?.error_code ?? 'UNAVAILABLE');
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new ApiError(response.status, 'INVALID_RESPONSE');
  return value as T;
}
