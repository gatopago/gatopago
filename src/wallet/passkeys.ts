import {
  assertWebAuthnChallenge,
  assertWebAuthnKey,
  assertWebAuthnScope,
  encodeWebAuthnAssertion,
  webAuthnKeyFromSpki,
  type WebAuthnScope,
} from '@gatopago/shared/v3/webauthn';
import { holdPageReload } from '../pwa/reload-guard';
import type { RegistrationChallenge } from '../auth/passkey-client';
type Hex = `0x${string}`;

export class PasskeyRequestError extends Error {
  constructor(
    public readonly code:
      | 'unsupported'
      | 'context'
      | 'busy'
      | 'expired'
      | 'cancelled'
      | 'invalid-response'
      | 'already-registered',
  ) {
    super(`Passkey request: ${code}`);
    this.name = 'PasskeyRequestError';
  }
}

// A browser ceremony guard only: no account, session, token or authorization is stored globally.
let busy = false;
const fail = (code: PasskeyRequestError['code']): never => {
  throw new PasskeyRequestError(code);
};

// Synchronous setup so get/create still runs in the initiating user gesture.
function ceremonyDeadline(timeout: number, signal?: AbortSignal) {
  const controller = new AbortController();
  const cancel = () => controller.abort(new PasskeyRequestError('cancelled'));
  const timer = setTimeout(() => controller.abort(new PasskeyRequestError('expired')), timeout);
  signal?.addEventListener('abort', cancel, { once: true });
  let abort!: () => void;
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => reject(controller.signal.reason);
    controller.signal.addEventListener('abort', abort, { once: true });
  });
  return {
    controller,
    cancelled,
    dispose() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      controller.signal.removeEventListener('abort', abort);
      controller.abort();
    },
  };
}

function credentialIdBytes(id: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]{1,1366}$/.test(id)) return fail('context');
  try {
    const raw = atob(id.replaceAll('-', '+').replaceAll('_', '/'));
    const canonical = btoa(raw).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    if (canonical !== id || raw.length > 1024) return fail('context');
    return Uint8Array.from(raw, (char) => char.charCodeAt(0));
  } catch {
    return fail('context');
  }
}

/**
 * Low-level ceremony, invoked only from an explicit confirmation action. The caller must derive
 * challenge from the reviewed typed authorization, validate the enrolled signer/current manifest,
 * and cancel on account/route changes. This function does not prepare, submit or retry a payment.
 * Import lazily from the future security/confirmation screen, never from marketing or a mount effect.
 */
type AssertionInput = {
  scope: WebAuthnScope;
  key: Hex;
  challenge: Hex;
  credentialId: string;
  validUntilMs: number;
  signal?: AbortSignal;
};
const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');

/** Public assertion bytes for the exact caller-reconstructed challenge. Enrollment,
 * InitializationApproval and UserOperation are distinct consents, never interchangeable. */
export async function requestPasskeyProof(input: AssertionInput) {
  return (await requestAssertion(input)).proof;
}

async function requestAssertion(input: AssertionInput, registrationContinuation = false) {
  if (typeof window === 'undefined' || !window.isSecureContext || !navigator.credentials?.get)
    return fail('unsupported');
  assertWebAuthnKey(input.scope, input.key);
  assertWebAuthnChallenge(input.challenge);
  if (
    window.location.origin !== input.scope.origin ||
    window.top !== window ||
    (!registrationContinuation && navigator.userActivation?.isActive !== true)
  )
    return fail('context');
  const id = credentialIdBytes(input.credentialId);
  if (!Number.isSafeInteger(input.validUntilMs) || input.validUntilMs <= Date.now())
    return fail('expired');
  const signal = input.signal;
  if (signal?.aborted) return fail('cancelled');
  if (busy) return fail('busy');
  // Snapshot caller data before the first await: route/account changes cannot replace the expected key.
  const expected = {
    scope: { ...input.scope },
    key: input.key,
    challenge: input.challenge,
    credentialId: input.credentialId,
    validUntilMs: input.validUntilMs,
  };
  const timeout = Math.min(60_000, input.validUntilMs - Date.now());
  const { controller, cancelled, dispose } = ceremonyDeadline(timeout, signal);
  const release = holdPageReload();
  busy = true;
  try {
    // No await before get(): retain the initiating click's user activation (notably Safari).
    const credential = await Promise.race([
      navigator.credentials.get({
        publicKey: {
          rpId: expected.scope.rpId,
          challenge: Uint8Array.from(expected.challenge.slice(2).match(/../g)!, (part) =>
            Number.parseInt(part, 16),
          ),
          allowCredentials: [{ type: 'public-key', id }],
          userVerification: 'required',
          timeout,
        },
        signal: controller.signal,
      }),
      cancelled,
    ]);
    if (controller.signal.aborted || signal?.aborted) return fail('cancelled');
    if (window.location.origin !== expected.scope.origin) return fail('context');
    if (Date.now() >= expected.validUntilMs) return fail('expired');
    if (
      !(credential instanceof PublicKeyCredential) ||
      credential.type !== 'public-key' ||
      credential.id !== expected.credentialId ||
      !(credential.response instanceof AuthenticatorAssertionResponse) ||
      new Uint8Array(credential.rawId).length !== id.length ||
      new Uint8Array(credential.rawId).some((byte, index) => byte !== id[index])
    )
      return fail('invalid-response');
    const response = {
      authenticatorData: new Uint8Array(credential.response.authenticatorData),
      clientDataJSON: new Uint8Array(credential.response.clientDataJSON),
      signatureDER: new Uint8Array(credential.response.signature),
    };
    encodeWebAuthnAssertion({ ...expected, response });
    return {
      proof: {
        authenticator_data: base64url(response.authenticatorData),
        client_data: base64url(response.clientDataJSON),
        signature: base64url(response.signatureDER),
      },
    };
  } catch (error) {
    if (error instanceof PasskeyRequestError) throw error;
    if (error instanceof DOMException && ['NotAllowedError', 'AbortError'].includes(error.name))
      return fail('cancelled');
    throw error;
  } finally {
    dispose();
    busy = false;
    release();
  }
}

/** Explicit create gesture. The
 * Worker re-derives the key from attestation; this local SPKI is only used to
 * check the following signature before sending it. Nothing is persisted here.
 */
type RegistrationInput = {
  scope: WebAuthnScope;
  challenge: Hex;
  userHandle: string;
  userName: string;
  displayName?: string;
  excludeCredentials: readonly string[];
  validUntilMs: number;
  signal?: AbortSignal;
  preference?: 'default' | 'security-key';
};
export async function requestPasskeyRegistration(
  input: RegistrationInput | (() => Promise<RegistrationInput>),
) {
  if (typeof window === 'undefined' || !window.isSecureContext || !navigator.credentials?.create)
    return fail('unsupported');
  // Capture the initiating click before obtaining the server challenge.
  if (window.top !== window || navigator.userActivation?.isActive !== true) return fail('context');
  if (typeof input === 'function') input = await input();
  assertWebAuthnScope(input.scope);
  assertWebAuthnChallenge(input.challenge);
  if (window.location.origin !== input.scope.origin || window.top !== window)
    return fail('context');
  const userId = credentialIdBytes(input.userHandle);
  if (
    userId.length !== 32 ||
    !/^(?:GatoPago [0-9a-f]{8}|[a-z][a-z0-9_]{2,29})$/.test(input.userName) ||
    (input.displayName !== undefined &&
      (!input.displayName.trim() ||
        input.displayName.length > 80 ||
        /[\p{Cc}\p{Cf}]/u.test(input.displayName))) ||
    !Array.isArray(input.excludeCredentials) ||
    input.excludeCredentials.length > 16 ||
    new Set(input.excludeCredentials).size !== input.excludeCredentials.length ||
    !['default', 'security-key'].includes(input.preference ?? 'default')
  )
    return fail('context');
  const excluded = input.excludeCredentials.map((id) => ({
    type: 'public-key' as const,
    id: credentialIdBytes(id),
  }));
  if (!Number.isSafeInteger(input.validUntilMs) || input.validUntilMs <= Date.now())
    return fail('expired');
  const signal = input.signal;
  if (signal?.aborted) return fail('cancelled');
  if (busy) return fail('busy');
  const expected = {
    scope: { ...input.scope },
    challenge: input.challenge,
    validUntilMs: input.validUntilMs,
  };
  const timeout = Math.min(60_000, expected.validUntilMs - Date.now());
  const { controller, cancelled, dispose } = ceremonyDeadline(timeout, signal);
  const release = holdPageReload();
  busy = true;
  try {
    const credential = await Promise.race([
      navigator.credentials.create({
        publicKey: {
          rp: { id: expected.scope.rpId, name: 'GatoPago' },
          user: {
            id: userId,
            name: input.userName,
            displayName: input.displayName ?? 'Tu cuenta GatoPago',
          },
          challenge: Uint8Array.from(expected.challenge.slice(2).match(/../g)!, (part) =>
            Number.parseInt(part, 16),
          ),
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
          timeout,
          attestation: 'none',
          excludeCredentials: excluded,
          authenticatorSelection: {
            residentKey: 'required',
            userVerification: 'required',
            ...(input.preference === 'security-key'
              ? { authenticatorAttachment: 'cross-platform' as const }
              : {}),
          },
          ...(input.preference === 'security-key' ? { hints: ['security-key'] } : {}),
        },
        signal: controller.signal,
      }),
      cancelled,
    ]);
    if (controller.signal.aborted || signal?.aborted) return fail('cancelled');
    if (window.location.origin !== expected.scope.origin) return fail('context');
    if (Date.now() >= expected.validUntilMs) return fail('expired');
    if (
      !(credential instanceof PublicKeyCredential) ||
      credential.type !== 'public-key' ||
      !(credential.response instanceof AuthenticatorAttestationResponse)
    )
      return fail('invalid-response');
    const id = credentialIdBytes(credential.id);
    if (
      base64url(new Uint8Array(credential.rawId)) !== credential.id ||
      excluded.some((item) => base64url(item.id) === credential.id)
    )
      return fail('invalid-response');
    const response = credential.response;
    if (
      !response.getPublicKey ||
      !response.getPublicKeyAlgorithm ||
      response.getPublicKeyAlgorithm() !== -7
    )
      return fail('unsupported');
    const spki = response.getPublicKey();
    if (!spki) return fail('unsupported');
    const key = webAuthnKeyFromSpki(expected.scope, new Uint8Array(spki));
    const clientData = new Uint8Array(response.clientDataJSON),
      attestation = new Uint8Array(response.attestationObject);
    if (
      !clientData.length ||
      clientData.length > 2048 ||
      !attestation.length ||
      attestation.length > 8192
    )
      return fail('invalid-response');
    const json: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(clientData));
    if (
      !json ||
      typeof json !== 'object' ||
      !('type' in json) ||
      json.type !== 'webauthn.create' ||
      !('origin' in json) ||
      json.origin !== expected.scope.origin ||
      !('challenge' in json) ||
      json.challenge !==
        base64url(
          Uint8Array.from(expected.challenge.slice(2).match(/../g)!, (part) =>
            Number.parseInt(part, 16),
          ),
        ) ||
      !('crossOrigin' in json) ||
      json.crossOrigin !== false ||
      'topOrigin' in json
    )
      return fail('invalid-response');
    const knownTransports = ['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb'];
    return {
      key,
      registration: {
        credential_id: base64url(id),
        client_data: base64url(clientData),
        attestation: base64url(attestation),
        transports: [...new Set(response.getTransports?.() ?? [])]
          .filter((value) => knownTransports.includes(value))
          .sort(),
      },
    };
  } catch (error) {
    if (error instanceof PasskeyRequestError) throw error;
    if (error instanceof DOMException && error.name === 'InvalidStateError')
      return fail('already-registered');
    if (error instanceof DOMException && ['NotAllowedError', 'AbortError'].includes(error.name))
      return fail('cancelled');
    throw error;
  } finally {
    dispose();
    busy = false;
    release();
  }
}

/** Discoverable login only. Wallet Core verifies the returned key and signature;
 * this assertion never substitutes for an onchain operation's authorization. */
type LoginInput = {
  scope: WebAuthnScope;
  challenge: Hex;
  validUntilMs: number;
  signal?: AbortSignal;
};
export async function requestPasskeyLogin(input: LoginInput | (() => Promise<LoginInput>)) {
  if (typeof window === 'undefined' || !window.isSecureContext || !navigator.credentials?.get)
    return fail('unsupported');
  if (window.top !== window || navigator.userActivation?.isActive !== true) return fail('context');
  if (typeof input === 'function') input = await input();
  assertWebAuthnScope(input.scope);
  assertWebAuthnChallenge(input.challenge);
  if (window.location.origin !== input.scope.origin || window.top !== window)
    return fail('context');
  if (!Number.isSafeInteger(input.validUntilMs) || input.validUntilMs <= Date.now())
    return fail('expired');
  if (input.signal?.aborted) return fail('cancelled');
  if (busy) return fail('busy');
  const expected = {
    scope: { ...input.scope },
    challenge: input.challenge,
    validUntilMs: input.validUntilMs,
  };
  const timeout = Math.min(60_000, expected.validUntilMs - Date.now());
  const signal = input.signal;
  const { controller, cancelled, dispose } = ceremonyDeadline(timeout, signal);
  const release = holdPageReload();
  busy = true;
  try {
    const credential = await Promise.race([
      navigator.credentials.get({
        publicKey: {
          rpId: expected.scope.rpId,
          challenge: Uint8Array.from(expected.challenge.slice(2).match(/../g)!, (part) =>
            Number.parseInt(part, 16),
          ),
          userVerification: 'required',
          timeout,
        },
        signal: controller.signal,
      }),
      cancelled,
    ]);
    if (controller.signal.aborted || signal?.aborted) return fail('cancelled');
    if (Date.now() >= expected.validUntilMs) return fail('expired');
    if (window.location.origin !== expected.scope.origin) return fail('context');
    if (
      !(credential instanceof PublicKeyCredential) ||
      credential.type !== 'public-key' ||
      !(credential.response instanceof AuthenticatorAssertionResponse)
    )
      return fail('invalid-response');
    credentialIdBytes(credential.id);
    const r = credential.response;
    const auth = new Uint8Array(r.authenticatorData),
      client = new Uint8Array(r.clientDataJSON),
      signature = new Uint8Array(r.signature);
    if (
      base64url(new Uint8Array(credential.rawId)) !== credential.id ||
      !r.userHandle ||
      r.userHandle.byteLength !== 32 ||
      auth.length < 37 ||
      auth.length > 1024 ||
      (auth[32] & 5) !== 5 ||
      !client.length ||
      client.length > 2048 ||
      !signature.length ||
      signature.length > 72
    )
      return fail('invalid-response');
    const data: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(client));
    if (
      !data ||
      typeof data !== 'object' ||
      !('type' in data) ||
      data.type !== 'webauthn.get' ||
      !('origin' in data) ||
      data.origin !== expected.scope.origin ||
      !('challenge' in data) ||
      data.challenge !==
        base64url(
          Uint8Array.from(expected.challenge.slice(2).match(/../g)!, (part) =>
            Number.parseInt(part, 16),
          ),
        ) ||
      !('crossOrigin' in data) ||
      data.crossOrigin !== false ||
      'topOrigin' in data
    )
      return fail('invalid-response');
    return {
      credential_id: credential.id,
      authenticator_data: base64url(auth),
      client_data: base64url(client),
      signature: base64url(signature),
      user_handle: base64url(new Uint8Array(r.userHandle)),
    };
  } catch (error) {
    if (error instanceof DOMException && ['NotAllowedError', 'AbortError'].includes(error.name))
      return fail('cancelled');
    throw error;
  } finally {
    dispose();
    busy = false;
    release();
  }
}

/** One Create account click starts both registration ceremonies. The second
 * assertion proves the newly created credential, never a wallet/payment consent. */
export async function requestAccountRegistration(
  prepare: () => Promise<RegistrationChallenge>,
  onCreated: (
    prepared: RegistrationChallenge,
    credential: Awaited<ReturnType<typeof requestPasskeyRegistration>>,
  ) => void,
  signal: AbortSignal,
) {
  let prepared!: RegistrationChallenge;
  const credential = await requestPasskeyRegistration(async () => {
    prepared = await prepare();
    return { ...prepared, signal };
  });
  onCreated(prepared, credential);
  const { proof } = await requestAssertion(
    {
      ...prepared,
      challenge: prepared.proofChallenge,
      key: credential.key,
      credentialId: credential.registration.credential_id,
      signal,
    },
    true,
  );
  return { id: prepared.id, submission: { ...credential.registration, proof } };
}
