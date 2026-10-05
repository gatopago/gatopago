import type { Address, Hex } from 'viem';
import { signOut } from './session';

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
}

export interface Recipient {
  username: string;
  display_name: string | null;
  address: Address;
}

export interface Approvals {
  initial_owners: Hex[] | null;
  approvals: { sequence: number; call: Hex; signature: Hex }[];
}

export async function api<T>(
  apiOrigin: string,
  path: string,
  init: { method?: string; body?: unknown; token?: string; signal?: AbortSignal } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiOrigin}/app/v1/${path}`, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: {
        Accept: 'application/json',
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: 'omit',
      cache: 'no-store',
      signal: init.signal ?? AbortSignal.timeout(20_000),
    });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ApiError(0, 'NETWORK_ERROR');
  }
  const value = await response.json().catch(() => null);
  // An expired or revoked session signs out; the app then returns to sign-in.
  if (response.status === 401 && init.token) signOut();
  if (!response.ok) throw new ApiError(response.status, value?.error_code ?? 'UNAVAILABLE');
  return value as T;
}
