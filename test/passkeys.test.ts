import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { encodeWebAuthnAssertion, webAuthnKeyFromSpki } from '@gatopago/shared/v3/webauthn';
import { PasskeyRequestError, requestPasskeyLogin, requestPasskeyAssertion, requestPasskeyProof, requestPasskeyRegistration } from '../src/wallet/passkeys';
import { isReloadBlocked } from '../src/pwa/reload-guard';

const captured = JSON.parse(readFileSync(new URL(import.meta.resolve('@gatopago/shared/fixtures/v3-webauthn-chromium.json')), 'utf8')) as {
  challenge: `0x${string}`; rpId: string; origin: string; spki: string;
  authenticatorData: string; clientDataJSON: string; signatureDER: string;
};
const bytes = (value: string) => Uint8Array.from(Buffer.from(value.slice(2), 'hex'));
const scope = { rpId: captured.rpId, origin: captured.origin };
const key = webAuthnKeyFromSpki(scope, bytes(captured.spki));
const get = vi.fn();
const create = vi.fn();
class Attestation {
  clientDataJSON = new TextEncoder().encode(JSON.stringify({ type: 'webauthn.create',
    challenge: Buffer.from(bytes(captured.challenge)).toString('base64url'), origin: scope.origin, crossOrigin: false })).buffer;
  attestationObject = new Uint8Array([1, 2, 3]).buffer; // Opaque to the browser adapter; Worker verifies real CBOR separately.
  getPublicKey() { return bytes(captured.spki).buffer; }
  getPublicKeyAlgorithm() { return -7; }
  getTransports() { return ['internal']; }
}
class Assertion {
  authenticatorData = bytes(captured.authenticatorData).buffer;
  clientDataJSON = new TextEncoder().encode(captured.clientDataJSON).buffer;
  signature = bytes(captured.signatureDER).buffer;
}
class Credential {
  id = 'AQID'; type = 'public-key'; rawId = new Uint8Array([1, 2, 3]).buffer;
  response = new Assertion();
}
const request = () => ({ scope: { ...scope }, key, challenge: captured.challenge, credentialId: 'AQID', validUntilMs: Date.now() + 60_000 });
const registrationRequest = () => ({ scope: { ...scope }, challenge: captured.challenge,
  userHandle: Buffer.alloc(32, 1).toString('base64url'), userName: 'GatoPago deadbeef',
  excludeCredentials: [] as string[], validUntilMs: Date.now() + 60_000 });
const registered = () => Object.assign(new Credential(), { response: new Attestation() });

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-08T12:00:00Z')); get.mockReset(); create.mockReset();
  const browser = { isSecureContext: true, location: { origin: scope.origin }, top: null as unknown };
  browser.top = browser;
  vi.stubGlobal('window', browser);
  vi.stubGlobal('navigator', { credentials: { get, create }, userActivation: { isActive: true } });
  vi.stubGlobal('PublicKeyCredential', Credential); vi.stubGlobal('AuthenticatorAssertionResponse', Assertion);
  vi.stubGlobal('AuthenticatorAttestationResponse', Attestation);
  get.mockResolvedValue(new Credential());
  create.mockResolvedValue(registered());
});

describe('V3 explicit registration, distinct from enrollment proof or account creation', () => {
  it('creates synchronously from the gesture with ES256, required UV/resident key and no forced manager', async () => {
    expect(create).not.toHaveBeenCalled();
    const result = requestPasskeyRegistration(registrationRequest());
    expect(create).toHaveBeenCalledOnce(); expect(isReloadBlocked()).toBe(true);
    const options = create.mock.calls[0][0] as CredentialCreationOptions;
    expect(options.publicKey).toMatchObject({ rp: { id: scope.rpId, name: 'GatoPago' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }], attestation: 'none',
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' }, excludeCredentials: [] });
    expect(options.publicKey?.authenticatorSelection?.authenticatorAttachment).toBeUndefined();
    expect(await result).toMatchObject({ key, registration: { credential_id: 'AQID', transports: ['internal'] } });
    expect(get).not.toHaveBeenCalled(); // No automatic follow-up prompt or recovery.
  });
  it('offers a security-key preference only when explicitly requested', async () => {
    await requestPasskeyRegistration({ ...registrationRequest(), preference: 'security-key' });
    const options = create.mock.calls[0][0] as CredentialCreationOptions;
    expect(options.publicKey?.authenticatorSelection?.authenticatorAttachment).toBe('cross-platform');
  });
  it('returns a verified raw enrollment proof without changing the transaction assertion format', async () => {
    const proof = await requestPasskeyProof(request());
    expect(proof).toEqual({ authenticator_data: Buffer.from(bytes(captured.authenticatorData)).toString('base64url'),
      client_data: Buffer.from(captured.clientDataJSON).toString('base64url'), signature: Buffer.from(bytes(captured.signatureDER)).toString('base64url') });
  });
  it.each(['SSR', 'insecure', 'iframe', 'no-click', 'origin'])('does not open registration in %s', async (variant) => {
    if (variant === 'SSR') vi.stubGlobal('window', undefined);
    if (variant === 'insecure') Object.assign(window, { isSecureContext: false });
    if (variant === 'iframe') Object.assign(window, { top: {} });
    if (variant === 'no-click') vi.stubGlobal('navigator', { credentials: { create }, userActivation: { isActive: false } });
    if (variant === 'origin') Object.assign(window, { location: { origin: 'https://evil.test' } });
    await expect(requestPasskeyRegistration(registrationRequest())).rejects.toBeInstanceOf(PasskeyRequestError);
    expect(create).not.toHaveBeenCalled();
  });
  it('rejects invalid user handle, duplicate exclusion IDs, arbitrary display identity or deadline', async () => {
    for (const fields of [{ userHandle: 'AQID' }, { userName: 'user@gmail.com' }, { excludeCredentials: ['AQID', 'AQID'] },
      { excludeCredentials: ['invalid='] }, { validUntilMs: 0 }]) {
      await expect(requestPasskeyRegistration({ ...registrationRequest(), ...fields })).rejects.toBeInstanceOf(PasskeyRequestError);
    }
    expect(create).not.toHaveBeenCalled();
  });
  it('holds a shared create/get guard and times out even when a browser ignores abort', async () => {
    create.mockImplementation(() => new Promise(() => undefined));
    const result = requestPasskeyRegistration({ ...registrationRequest(), validUntilMs: Date.now() + 1000 });
    const pending = expect(result).rejects.toMatchObject({ code: 'expired' });
    await expect(requestPasskeyAssertion(request())).rejects.toMatchObject({ code: 'busy' });
    await expect(requestPasskeyRegistration(registrationRequest())).rejects.toMatchObject({ code: 'busy' });
    await vi.advanceTimersByTimeAsync(1000); await pending;
    expect((create.mock.calls[0][0] as CredentialCreationOptions).signal?.aborted).toBe(true);
    create.mockResolvedValue(registered()); await requestPasskeyRegistration(registrationRequest());
  });
  it('discards a late registration after route/account cancellation and uses the original scope', async () => {
    let resolve!: (value: ReturnType<typeof registered>) => void;
    create.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const controller = new AbortController(), value = { ...registrationRequest(), signal: controller.signal };
    const result = requestPasskeyRegistration(value), pending = expect(result).rejects.toMatchObject({ code: 'cancelled' });
    value.signal = new AbortController().signal; value.scope.origin = 'https://evil.test';
    controller.abort(); await pending; resolve(registered()); await Promise.resolve();
  });
  it.each(['null', 'plain', 'raw-id', 'wrong-origin', 'wrong-challenge', 'wrong-algorithm', 'oversized', 'excluded'])('rejects invalid %s registration responses', async (variant) => {
    const value = registered(); const options = registrationRequest();
    if (variant === 'raw-id') value.rawId = new Uint8Array([9]).buffer;
    if (variant === 'wrong-origin' || variant === 'wrong-challenge') value.response.clientDataJSON = new TextEncoder().encode(JSON.stringify({
      type: 'webauthn.create', origin: variant === 'wrong-origin' ? 'https://evil.test' : scope.origin,
      challenge: variant === 'wrong-challenge' ? 'wrong' : Buffer.from(bytes(captured.challenge)).toString('base64url'), crossOrigin: false,
    })).buffer;
    if (variant === 'wrong-algorithm') value.response.getPublicKeyAlgorithm = () => -257;
    if (variant === 'oversized') value.response.attestationObject = new Uint8Array(8193).buffer;
    if (variant === 'excluded') options.excludeCredentials = ['AQID'];
    create.mockResolvedValue(variant === 'null' ? null : variant === 'plain' ? { ...value } : value);
    await expect(requestPasskeyRegistration(options)).rejects.toBeInstanceOf(PasskeyRequestError);
  });
  it.each([['InvalidStateError', 'already-registered'], ['NotAllowedError', 'cancelled'], ['AbortError', 'cancelled']])('maps %s without starting recovery or another prompt', async (name, code) => {
    create.mockRejectedValue(new DOMException('synthetic browser error', name));
    await expect(requestPasskeyRegistration(registrationRequest())).rejects.toMatchObject({ code });
    expect(create).toHaveBeenCalledOnce(); expect(get).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
});
afterEach(() => { expect(isReloadBlocked()).toBe(false); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('V3 explicit passkey ceremony (browser API mocked; cryptographic verification real)', () => {
  it('does nothing on module import and requests only the selected key with required UV', async () => {
    expect(get).not.toHaveBeenCalled();
    const value = request(); const result = requestPasskeyAssertion(value);
    expect(get).toHaveBeenCalledOnce(); // before the first await, preserving the initiating user gesture
    expect(isReloadBlocked()).toBe(true);
    const options = get.mock.calls[0][0] as CredentialRequestOptions;
    expect(options.publicKey).toEqual({ rpId: scope.rpId, challenge: bytes(captured.challenge),
      allowCredentials: [{ type: 'public-key', id: new Uint8Array([1, 2, 3]) }], userVerification: 'required', timeout: 60_000 });
    const raw = new Credential().response;
    expect(await result).toBe(encodeWebAuthnAssertion({ ...value, response: {
      authenticatorData: new Uint8Array(raw.authenticatorData), clientDataJSON: new Uint8Array(raw.clientDataJSON), signatureDER: new Uint8Array(raw.signature),
    } }));
  });
  it.each(['SSR', 'insecure', 'unsupported', 'iframe', 'origin', 'no-click'])('blocks %s before opening a prompt', async (caseName) => {
    if (caseName === 'SSR') vi.stubGlobal('window', undefined);
    if (caseName === 'insecure') Object.assign(window, { isSecureContext: false });
    if (caseName === 'unsupported') vi.stubGlobal('navigator', {});
    if (caseName === 'iframe') Object.assign(window, { top: {} });
    if (caseName === 'origin') Object.assign(window, { location: { origin: 'https://gatopago.com' } });
    if (caseName === 'no-click') vi.stubGlobal('navigator', { credentials: { get }, userActivation: { isActive: false } });
    await expect(requestPasskeyAssertion(request())).rejects.toBeInstanceOf(PasskeyRequestError); expect(get).not.toHaveBeenCalled();
  });
  it.each(['', 'AQID=', 'AB', 'A', 'a'.repeat(1367)])('rejects a noncanonical credential ID %s', async (credentialId) => {
    await expect(requestPasskeyAssertion({ ...request(), credentialId })).rejects.toMatchObject({ code: 'context' });
    expect(get).not.toHaveBeenCalled();
  });
  it.each([0, -1, NaN, Infinity, 1.5])('rejects invalid deadline %s', async (validUntilMs) => {
    await expect(requestPasskeyAssertion({ ...request(), validUntilMs })).rejects.toMatchObject({ code: 'expired' });
    expect(get).not.toHaveBeenCalled();
  });
  it('rejects an already-aborted action and a scope/key mismatch before the prompt', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(requestPasskeyAssertion({ ...request(), signal: controller.signal })).rejects.toMatchObject({ code: 'cancelled' });
    await expect(requestPasskeyAssertion({ ...request(), scope: { rpId: 'gatopago.com', origin: 'https://gatopago.com' } })).rejects.toThrow();
    expect(get).not.toHaveBeenCalled();
  });
  it('prevents double prompts, times out even a browser ignoring abort, and permits an explicit retry', async () => {
    get.mockImplementation(() => new Promise(() => undefined));
    const value = request(); const result = requestPasskeyAssertion({ ...value, validUntilMs: Date.now() + 1500 });
    const assertion = expect(result).rejects.toMatchObject({ code: 'expired' });
    await expect(requestPasskeyAssertion(value)).rejects.toMatchObject({ code: 'busy' });
    expect(get).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1500); await assertion;
    expect((get.mock.calls[0][0] as CredentialRequestOptions).signal?.aborted).toBe(true);
    expect(isReloadBlocked()).toBe(false);
    get.mockResolvedValue(new Credential()); await expect(requestPasskeyAssertion(request())).resolves.toMatch(/^0x/);
  });
  it('cancels on the original signal even if caller replaces the input signal or payload', async () => {
    let resolve!: (value: Credential) => void;
    get.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const controller = new AbortController(); const value = { ...request(), signal: controller.signal };
    const result = requestPasskeyAssertion(value); const assertion = expect(result).rejects.toMatchObject({ code: 'cancelled' });
    value.signal = new AbortController().signal; value.scope.origin = 'https://evil.test';
    controller.abort(); await assertion;
    resolve(new Credential()); await Promise.resolve(); // Late resolution cannot leak a usable authorization.
  });
  it('uses the snapshot of the reviewed challenge and key, not caller mutations while waiting', async () => {
    let resolve!: (value: Credential) => void;
    get.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const value = request(); const result = requestPasskeyAssertion(value);
    value.challenge = `0x${'ff'.repeat(32)}`; value.scope.origin = 'https://evil.test'; value.credentialId = 'BAUG';
    resolve(new Credential()); await expect(result).resolves.toMatch(/^0x/);
  });
  it.each(['null', 'plain-object', 'wrong-id', 'wrong-raw-id', 'registration', 'tampered'])('rejects an invalid %s response', async (variant) => {
    const credential = new Credential();
    if (variant === 'wrong-id') credential.id = 'BAUG';
    if (variant === 'wrong-raw-id') credential.rawId = new Uint8Array([4, 5, 6]).buffer;
    if (variant === 'registration') Object.assign(credential, { response: {} });
    if (variant === 'tampered') new Uint8Array(credential.response.signature)[10] ^= 1;
    get.mockResolvedValue(variant === 'null' ? null : variant === 'plain-object' ? { ...credential } : credential);
    await expect(requestPasskeyAssertion(request())).rejects.toThrow();
  });
  it.each(['NotAllowedError', 'AbortError'])('reports %s as cancelled, without retrying or changing keys', async (name) => {
    get.mockRejectedValue(new DOMException('Dismissed', name));
    await expect(requestPasskeyAssertion(request())).rejects.toMatchObject({ code: 'cancelled' });
    expect(get).toHaveBeenCalledOnce();
  });
  it('releases timers and reload guard on synchronous browser failure', async () => {
    get.mockImplementation(() => { throw new Error('Browser failure'); });
    await expect(requestPasskeyAssertion(request())).rejects.toThrow('Browser failure');
    expect(vi.getTimerCount()).toBe(0);
  });
});


describe('Discoverable session login, distinct from transaction approval', () => {
  it('opens get synchronously without an allowlist and returns the user handle', async () => {
    const credential = new Credential(); Object.assign(credential.response, { userHandle: new Uint8Array(32).fill(3).buffer });
    get.mockResolvedValue(credential);
    const pending = requestPasskeyLogin(request());
    expect(get).toHaveBeenCalledOnce(); expect(isReloadBlocked()).toBe(true);
    const options = get.mock.calls[0][0] as CredentialRequestOptions;
    expect(options.publicKey?.allowCredentials).toBeUndefined(); expect(options.publicKey?.userVerification).toBe('required');
    expect(await pending).toMatchObject({ credential_id: 'AQID', user_handle: Buffer.alloc(32, 3).toString('base64url') });
    expect(isReloadBlocked()).toBe(false);
  });
  it('rejects missing handles, unverified users and wrong client challenges', async () => {
    for (const variant of ['handle', 'uv', 'challenge']) {
      const credential = new Credential(); Object.assign(credential.response, { userHandle: new Uint8Array(32).buffer });
      if (variant === 'handle') Object.assign(credential.response, { userHandle: null });
      if (variant === 'uv') new Uint8Array(credential.response.authenticatorData)[32] = 1;
      if (variant === 'challenge') credential.response.clientDataJSON = new TextEncoder().encode(JSON.stringify({ type: 'webauthn.get', origin: scope.origin, challenge: 'wrong', crossOrigin: false })).buffer;
      get.mockResolvedValue(credential);
      await expect(requestPasskeyLogin(request())).rejects.toMatchObject({ code: 'invalid-response' });
    }
  });
  it('shares the ceremony guard and cancels even when the authenticator ignores abort', async () => {
    get.mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController(); const pending = requestPasskeyLogin({ ...request(), signal: controller.signal });
    await expect(requestPasskeyRegistration(registrationRequest())).rejects.toMatchObject({ code: 'busy' });
    controller.abort(); await expect(pending).rejects.toMatchObject({ code: 'cancelled' }); expect(isReloadBlocked()).toBe(false);
  });
  it('uses the chosen username and display name for a new account', async () => {
    await requestPasskeyRegistration({ ...registrationRequest(), userName: 'daniel', displayName: 'Daniel' });
    expect(create.mock.calls[0][0].publicKey.user).toMatchObject({ name: 'daniel', displayName: 'Daniel' });
  });
});
