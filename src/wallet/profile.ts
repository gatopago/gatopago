import type { Environment } from '@gatopago/environment';
import { readJsonBounded } from '@gatopago/shared/http';
import { parseNetworkId, parseResourceId } from '@gatopago/shared/v3/primitives';
import type { EnabledAuthConfig } from '../auth/config';
import { exact, record, walletTransport, WalletCoreError } from './http';

export type Profile = Readonly<{ user_id: string; display_name: string; username: string | null;
  username_reserved_until: number | null; username_published_at: number | null; receiving_wallet_id: string | null }>;
export type Recipient = Readonly<{ username: string; display_name: string; network_id: string; address: `0x${string}`; verified_at: number; expires_at: number }>;
class ProfileClientError extends Error {
  constructor(readonly code: 'profile/unavailable' | 'profile/username-unavailable' | 'profile/immutable' | 'profile/receiving-unavailable' | 'profile/not-found' | 'profile/rate-limited') {
    super(code); this.name = 'ProfileClientError';
  }
}
const invalid = (): never => { throw new ProfileClientError('profile/unavailable'); };
const validName = (value: unknown): value is string => typeof value === 'string' && value.length >= 1 && value.length <= 80
  && value === value.normalize('NFC').trim() && !/[\p{Cc}\p{Cf}]/u.test(value);
export function normalizeUsername(value: string): string {
  const username = value.trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,29}$/.test(username)) return invalid();
  return username;
}
function parseProfile(value: unknown, uid: string): Profile {
  if (!record(value) || !exact(value, ['user_id', 'display_name', 'username', 'username_reserved_until', 'username_published_at', 'receiving_wallet_id'])
    || value.user_id !== uid || !validName(value.display_name)
    || (value.username !== null && (typeof value.username !== 'string' || normalizeUsername(value.username) !== value.username))) return invalid();
  parseResourceId('user', value.user_id);
  if (value.receiving_wallet_id !== null) parseResourceId('wallet', value.receiving_wallet_id);
  for (const field of ['username_reserved_until', 'username_published_at'] as const) {
    if (value[field] !== null && (typeof value[field] !== 'number' || !Number.isSafeInteger(value[field]) || value[field] <= 0)) return invalid();
  }
  if (value.username === null ? value.username_published_at !== null || value.username_reserved_until !== null
    : value.username_published_at === null ? value.username_reserved_until === null
    : value.username_reserved_until !== null || value.receiving_wallet_id === null) return invalid();
  return Object.freeze(value as Profile);
}
function check(status: number, value: unknown) {
  if (status === 200) return;
  if (status === 404) throw new ProfileClientError('profile/not-found');
  if (status === 429) throw new ProfileClientError('profile/rate-limited');
  const code = record(value) ? value.error_code : '';
  if (status === 409 && code === 'USERNAME_UNAVAILABLE') throw new ProfileClientError('profile/username-unavailable');
  if (status === 409 && code === 'PROFILE_IMMUTABLE') throw new ProfileClientError('profile/immutable');
  if (status === 503 && code === 'RECEIVING_UNAVAILABLE') throw new ProfileClientError('profile/receiving-unavailable');
  return invalid();
}
export function profileClient(config: EnabledAuthConfig, token: () => Promise<string>, uid: string) {
  async function request(path: string, method: 'GET' | 'POST', input: object, signal: AbortSignal, publishing = false) {
    const result = await walletTransport(config, token, signal, publishing ? 'chain-read' : 'default').request(path, method, input);
    check(result.status, result.value); return parseProfile(result.value, uid);
  }
  return {
    read: (signal: AbortSignal) => request('/profile', 'GET', {}, signal),
    rename: (name: string, signal: AbortSignal) => request('/profile', 'POST', { display_name: name }, signal),
    publish: (username: string, walletId: string, accountId: string, signal: AbortSignal) => request('/profile/username', 'POST', {
      username: normalizeUsername(username), wallet_id: parseResourceId('wallet', walletId), wallet_account_id: parseResourceId('walletAccount', accountId),
    }, signal, true),
  };
}
export function parseRecipient(value: unknown, username: string, network: string, now = Math.floor(Date.now() / 1000)): Recipient {
  if (!record(value) || !exact(value, ['username', 'display_name', 'network_id', 'address', 'verified_at', 'expires_at'])
    || value.username !== normalizeUsername(username) || value.network_id !== parseNetworkId(network) || !validName(value.display_name)
    || typeof value.address !== 'string' || !/^0x[0-9a-f]{40}$/.test(value.address) || /^0x0+$/.test(value.address)
    || typeof value.verified_at !== 'number' || !Number.isSafeInteger(value.verified_at) || value.verified_at > now + 5 || value.verified_at < now - 60
    || typeof value.expires_at !== 'number' || !Number.isSafeInteger(value.expires_at) || value.expires_at <= now
    || value.expires_at > value.verified_at + 60) return invalid();
  return Object.freeze(value as Recipient);
}
/** No session, private wallet IDs or remote URL overrides cross this public boundary. */
export async function resolveUsername(environment: Environment, input: string, networkInput: string, caller: AbortSignal) {
  const username = normalizeUsername(input), network = parseNetworkId(networkInput), config = environment;
  if (!config.wallet_candidates.includes(network)) return invalid();
  const signal = AbortSignal.any([caller, AbortSignal.timeout(45_000)]); signal.throwIfAborted();
  const response = await fetch(`${config.api_origin}/app/v1/recipients/${username}?network_id=${encodeURIComponent(network)}`, {
    method: 'GET', signal, credentials: 'omit', redirect: 'error', cache: 'no-store', headers: { Accept: 'application/json' } });
  const value = await readJsonBounded(response, 4096, signal); signal.throwIfAborted(); check(response.status, value);
  return parseRecipient(value, username, network);
}
export function profileMessage(error: unknown, en: boolean): string {
  if (error instanceof WalletCoreError && error.code === 'client/update-required') return en ? 'Update GatoPago to continue.' : 'Actualiza GatoPago para continuar.';
  if (error instanceof WalletCoreError && ['auth/session-changed', 'auth/unauthenticated'].includes(error.code)) return en ? 'Sign in again to continue.' : 'Vuelve a entrar para continuar.';
  if (error instanceof ProfileClientError) {
    if (error.code === 'profile/username-unavailable') return en ? 'That username is unavailable. Choose another.' : 'Ese username no está disponible. Elige otro.';
    if (error.code === 'profile/immutable') return en ? 'A published username and receiving wallet cannot be changed.' : 'El username publicado y su wallet receptora no se pueden cambiar.';
    if (error.code === 'profile/not-found') return en ? 'No published recipient was found on this network.' : 'No se encontró un destinatario publicado en esta red.';
    if (error.code === 'profile/rate-limited') return en ? 'Too many lookups. Wait before trying again.' : 'Hay demasiadas consultas. Espera antes de volver a intentar.';
  }
  return en ? 'We could not verify the result. Refresh before retrying. Receiving requires an active wallet with available spending keys.'
    : 'No pudimos verificar el resultado. Actualiza antes de reintentar. Recibir requiere una wallet activa con llaves de gasto disponibles.';
}
