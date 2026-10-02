import { parseResourceId } from '@gatopago/shared/v3/primitives';
import type { WebAuthnScope } from '@gatopago/shared/v3/webauthn';
import type { EnabledAuthConfig } from '../auth/config';
import type { requestPasskeyProof, requestPasskeyRegistration } from './passkeys';
import { exact, record, walletTransport, WalletCoreError } from './http';

type Hex = `0x${string}`;
export type PreparedEnrollment = Readonly<{
  kind: 'prepared'; id: string; scope: WebAuthnScope; challenge: Hex; proofChallenge: Hex;
  userHandle: string; userName: string; excludeCredentials: readonly string[]; validUntilMs: number;
}>;
export type Enrolled = Readonly<{ kind: 'enrolled'; id: string }>;
export type EnrollmentSubmission = Awaited<ReturnType<typeof requestPasskeyRegistration>>['registration'] & {
  proof: Awaited<ReturnType<typeof requestPasskeyProof>>;
};
class EnrollmentClientError extends Error {
  constructor(readonly code: 'enrollment/unavailable' | 'enrollment/invalid' | 'enrollment/expired' | 'enrollment/conflict' | 'enrollment/limit') {
    super(code); this.name = 'EnrollmentClientError';
  }
}
const invalid = (): never => { throw new EnrollmentClientError('enrollment/invalid'); };
function bytes(input: unknown, length?: number): Uint8Array {
  if (typeof input !== 'string' || !/^[A-Za-z0-9_-]{1,1366}$/.test(input)) return invalid();
  const raw = atob(input.replaceAll('-', '+').replaceAll('_', '/'));
  if (btoa(raw).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') !== input || raw.length > 1024
      || (length !== undefined && raw.length !== length)) return invalid();
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}
function hash(input: unknown): Hex {
  if (typeof input !== 'string' || !/^0x[0-9a-f]{64}$/.test(input) || /^0x0+$/.test(input)) return invalid();
  return input as Hex;
}
function enrolled(input: unknown, id: string): Enrolled {
  if (!record(input) || !exact(input, ['enrollment_id', 'state', 'onchain_authority']) || input.enrollment_id !== id
      || input.state !== 'enrolled' || input.onchain_authority !== false) return invalid();
  return Object.freeze({ kind: 'enrolled', id });
}
function parsePreparation(input: unknown, id: string, config: EnabledAuthConfig): PreparedEnrollment | Enrolled {
  if (record(input) && input.state === 'enrolled') return enrolled(input, id);
  if (!record(input) || !exact(input, ['enrollment_id', 'state', 'expires_at', 'scope', 'proof_challenge', 'options', 'onchain_authority'])
      || input.enrollment_id !== id || input.state !== 'prepared' || input.onchain_authority !== false) return invalid();
  const { scope, options: options, expires_at: expires } = input;
  const expected = config.deployment;
  if (!record(scope) || !exact(scope, ['rpId', 'origin']) || scope.rpId !== expected.webauthn_rp_id
      || scope.origin !== config.webOrigin || scope.origin !== expected.web_origin) return invalid();
  if (!record(options) || !exact(options, ['challenge', 'rp', 'user', 'pubKeyCredParams', 'timeout', 'attestation', 'authenticatorSelection', 'excludeCredentials'])
      || !record(options.rp) || !exact(options.rp, ['id', 'name']) || options.rp.id !== scope.rpId || options.rp.name !== 'GatoPago'
      || !record(options.user) || !exact(options.user, ['id', 'name', 'displayName']) || typeof options.user.name !== 'string'
      || !/^GatoPago [0-9a-f]{8}$/.test(options.user.name) || options.user.displayName !== 'Tu cuenta GatoPago'
      || !Array.isArray(options.pubKeyCredParams) || options.pubKeyCredParams.length !== 1
      || !record(options.pubKeyCredParams[0]) || !exact(options.pubKeyCredParams[0], ['type', 'alg'])
      || options.pubKeyCredParams[0].type !== 'public-key' || options.pubKeyCredParams[0].alg !== -7
      || options.timeout !== 60000 || options.attestation !== 'none'
      || !record(options.authenticatorSelection) || !exact(options.authenticatorSelection, ['residentKey', 'userVerification'])
      || options.authenticatorSelection.residentKey !== 'required' || options.authenticatorSelection.userVerification !== 'required'
      || !Array.isArray(options.excludeCredentials) || options.excludeCredentials.length > 16) return invalid();
  const challenge = hash(`0x${Array.from(bytes(options.challenge, 32), (byte) => byte.toString(16).padStart(2, '0')).join('')}`);
  const proofChallenge = hash(input.proof_challenge);
  if (challenge === proofChallenge) return invalid();
  bytes(options.user.id, 32);
  const excludeCredentials = options.excludeCredentials.map((value: unknown) => {
    if (!record(value) || !exact(value, ['id', 'type']) || value.type !== 'public-key') return invalid();
    bytes(value.id); return value.id as string;
  });
  if (new Set(excludeCredentials).size !== excludeCredentials.length || typeof expires !== 'number'
      || !Number.isSafeInteger(expires) || expires * 1000 > Date.now() + 301_000) return invalid();
  if (expires * 1000 <= Date.now()) throw new EnrollmentClientError('enrollment/expired');
  return Object.freeze({ kind: 'prepared', id, scope: Object.freeze({ rpId: scope.rpId, origin: scope.origin }),
    challenge, proofChallenge, userHandle: options.user.id as string, userName: options.user.name,
    excludeCredentials: Object.freeze(excludeCredentials), validUntilMs: expires * 1000 });
}

function checkStatus(result: { status: number; value: unknown }) {
  if (result.status === 200) return;
  const codes = [
    [400, 'INVALID_ENROLLMENT', 'enrollment/invalid'], [410, 'ENROLLMENT_EXPIRED', 'enrollment/expired'],
    [409, 'ENROLLMENT_CONFLICT', 'enrollment/conflict'], [429, 'ENROLLMENT_LIMIT', 'enrollment/limit'],
  ] as const;
  for (const [status, code, clientCode] of codes) {
    if (result.status === status && record(result.value) && result.value.error_code === code) throw new EnrollmentClientError(clientCode);
  }
  throw new EnrollmentClientError('enrollment/unavailable');
}
function failure(error: unknown, signal: AbortSignal): never {
  if (signal.aborted) throw signal.reason;
  throw error instanceof WalletCoreError || error instanceof EnrollmentClientError ? error : new EnrollmentClientError('enrollment/unavailable');
}

export async function prepareEnrollment(config: EnabledAuthConfig, getToken: () => Promise<string>, id: string, signal: AbortSignal) {
  try {
    parseResourceId('operation', id);
    const { request } = walletTransport(config, getToken, signal);
    const result = await request('/security/enrollments', 'POST', { request_id: id });

    checkStatus(result);
    return parsePreparation(result.value, id, config);
  } catch (error) { return failure(error, signal); }
}
export async function completeEnrollment(config: EnabledAuthConfig, getToken: () => Promise<string>, id: string, submission: EnrollmentSubmission, signal: AbortSignal) {
  try {
    parseResourceId('operation', id);
    // This is a public-key proof, not a payment signature. Only the Worker can attest registration.
    if (new TextEncoder().encode(JSON.stringify(submission)).length > 24576) return invalid();
    const { request } = walletTransport(config, getToken, signal);
    const result = await request(`/security/enrollments/${id}/complete`, 'POST', submission);
    checkStatus(result);
    return enrolled(result.value, id);
  } catch (error) { return failure(error, signal); }
}
