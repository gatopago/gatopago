import { readJsonBounded } from '@gatopago/shared/http';
import { parseResourceId } from '@gatopago/shared/v3/primitives';
import { CLIENT_STATUS_HEADER, clientMutationHeaders } from '@gatopago/shared/v3/client-release';
import type { WebAuthnScope } from '@gatopago/shared/v3/webauthn';
import type { EnabledAuthConfig } from './config';
import { exact, record } from '../wallet/http';
import type { EnrollmentSubmission } from '../wallet/enrollment';
import type { requestPasskeyLogin } from '../wallet/passkeys';

type Hex = `0x${string}`;
export type LoginChallenge = Readonly<{ id: string; scope: WebAuthnScope; challenge: Hex; validUntilMs: number }>;
export type RegistrationChallenge = LoginChallenge & Readonly<{
  proofChallenge: Hex; userHandle: string; userName: string; displayName: string; excludeCredentials: readonly string[];
}>;
export type RegistrationInput = { invite: string; name: string; username: string; turnstile_token: string };
export class AccessError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'AccessError'; }
}
const invalid = (): never => { throw new AccessError('auth/invalid-response'); };
function bytes32(input: unknown): Hex {
  if (typeof input !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(input)) return invalid();
  const raw = atob(input.replaceAll('-', '+').replaceAll('_', '/'));
  if (raw.length !== 32 || btoa(raw).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') !== input) return invalid();
  return `0x${Array.from(raw, char => char.charCodeAt(0).toString(16).padStart(2, '0')).join('')}`;
}
function challenge(value: unknown, config: EnabledAuthConfig): LoginChallenge {
  if (!record(value) || !record(value.scope) || !exact(value.scope, ['rpId', 'origin']) || !record(value.options)) return invalid();
  const expected = config.deployment;
  if (value.scope.origin !== config.webOrigin || value.scope.origin !== expected.web_origin || value.scope.rpId !== expected.webauthn_rp_id
      || typeof value.expires_at !== 'number' || !Number.isSafeInteger(value.expires_at)
      || value.expires_at * 1000 > Date.now() + 301_000) return invalid();
  if (value.expires_at * 1000 <= Date.now()) throw new AccessError('auth/expired');
  return Object.freeze({ id: parseResourceId('operation', value.request_id), scope: Object.freeze({ origin: value.scope.origin, rpId: value.scope.rpId }),
    challenge: bytes32(value.options.challenge), validUntilMs: value.expires_at * 1000 });
}

/** Public admission endpoints: no existing bearer, cookies, redirects or automatic retries. */
export function passkeyClient(config: EnabledAuthConfig) {
  let updateRequired = false;
  async function request(path: string, input: object, caller: AbortSignal): Promise<unknown> {
    if (updateRequired) throw new AccessError('client/update-required');
    if (config.mode !== 'firebase' || config.apiOrigin !== config.deployment.api_origin) throw new AccessError('auth/unavailable');
    const signal = AbortSignal.any([caller, AbortSignal.timeout(15_000)]);
    signal.throwIfAborted();
    const body = JSON.stringify(input);
    if (new TextEncoder().encode(body).length > 24576) throw new AccessError('auth/invalid-request');
    const response = await fetch(`${config.apiOrigin}/app/v1/auth/${path}`, { method: 'POST', body, signal,
      credentials: 'omit', cache: 'no-store', redirect: 'error', headers: { 'Content-Type': 'application/json',
        Accept: 'application/json', ...clientMutationHeaders(config.environment) } });
    if (response.status === 409 && response.headers.get(CLIENT_STATUS_HEADER) === 'update-required') {
      void response.body?.cancel().catch(() => undefined); updateRequired = true; throw new AccessError('client/update-required');
    }
    if (response.status === 429) { void response.body?.cancel().catch(() => undefined); throw new AccessError('auth/too-many-requests'); }
    const value = await readJsonBounded<unknown>(response, 32768, signal);
    signal.throwIfAborted();
    if (response.status !== 200) {
      const code = record(value) ? value.error_code : null;
      if (response.status === 409 && ['INVITE_UNAVAILABLE', 'USERNAME_UNAVAILABLE', 'CHALLENGE_UNAVAILABLE'].includes(String(code))) {
        throw new AccessError(`auth/${String(code).toLowerCase().replaceAll('_', '-')}`);
      }
      if (response.status === 401) throw new AccessError('auth/unauthenticated');
      throw new AccessError('auth/unavailable');
    }
    return value;
  }
  async function complete(kind: 'register' | 'login', id: string, response: unknown, signal: AbortSignal) {
    parseResourceId('operation', id);
    const value = await request(`${kind}/complete`, { request_id: id, response }, signal);
    if (!record(value) || !exact(value, ['custom_token']) || typeof value.custom_token !== 'string'
        || value.custom_token.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.custom_token)) return invalid();
    return value.custom_token;
  }
  return {
    async prepareLogin(signal: AbortSignal): Promise<LoginChallenge> {
      const value = await request('login/options', {}, signal), prepared = challenge(value, config);
      if (!record(value) || !exact(value, ['request_id', 'expires_at', 'scope', 'options']) || !record(value.options)
          || !exact(value.options, ['challenge', 'rpId', 'userVerification', 'timeout']) || value.options.rpId !== prepared.scope.rpId
          || value.options.userVerification !== 'required' || value.options.timeout !== 60000) return invalid();
      return prepared;
    },
    async prepareRegistration(input: RegistrationInput, signal: AbortSignal): Promise<RegistrationChallenge> {
      const value = await request('register/options', input, signal), prepared = challenge(value, config);
      if (!record(value) || !exact(value, ['request_id', 'expires_at', 'scope', 'proof_challenge', 'options']) || !record(value.options)) return invalid();
      const o = value.options;
      if (!exact(o, ['challenge', 'rp', 'user', 'pubKeyCredParams', 'timeout', 'attestation', 'authenticatorSelection', 'excludeCredentials'])
          || !record(o.rp) || !exact(o.rp, ['id', 'name']) || o.rp.id !== prepared.scope.rpId || o.rp.name !== 'GatoPago'
          || !record(o.user) || !exact(o.user, ['id', 'name', 'displayName']) || o.user.name !== input.username.trim().toLowerCase()
          || o.user.displayName !== input.name.normalize('NFC').trim()
          || !Array.isArray(o.pubKeyCredParams) || o.pubKeyCredParams.length !== 1 || !record(o.pubKeyCredParams[0])
          || !exact(o.pubKeyCredParams[0], ['type', 'alg']) || o.pubKeyCredParams[0].type !== 'public-key' || o.pubKeyCredParams[0].alg !== -7
          || o.timeout !== 60000 || o.attestation !== 'none' || !record(o.authenticatorSelection)
          || !exact(o.authenticatorSelection, ['residentKey', 'userVerification']) || o.authenticatorSelection.residentKey !== 'required'
          || o.authenticatorSelection.userVerification !== 'required' || !Array.isArray(o.excludeCredentials) || o.excludeCredentials.length !== 0
          || typeof value.proof_challenge !== 'string' || !/^0x[0-9a-f]{64}$/.test(value.proof_challenge)
          || value.proof_challenge === prepared.challenge) return invalid();
      bytes32(o.user.id);
      return Object.freeze({ ...prepared, proofChallenge: value.proof_challenge as Hex, userHandle: o.user.id as string,
        userName: o.user.name as string, displayName: o.user.displayName as string, excludeCredentials: Object.freeze([]) });
    },
    completeRegistration: (id: string, response: EnrollmentSubmission, signal: AbortSignal) => complete('register', id, response, signal),
    completeLogin: (id: string, response: Awaited<ReturnType<typeof requestPasskeyLogin>>, signal: AbortSignal) => complete('login', id, response, signal),
  };
}
