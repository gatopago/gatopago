import { clientMutationHeaders, CLIENT_STATUS_HEADER, type AccountReleaseContext } from '@gatopago/shared/v3/client-release';
import type { EnabledAuthConfig } from '../auth/config';

export class WalletCoreError extends Error {
  constructor(readonly code: 'wallet/unavailable' | 'auth/session-changed' | 'auth/unauthenticated' | 'client/update-required') {
    super(code); this.name = 'WalletCoreError';
  }
}
export function record(input: unknown): input is Record<string, unknown> { return input !== null && typeof input === 'object' && !Array.isArray(input); }
export function exact(input: Record<string, unknown>, fields: string[]) { return Object.keys(input).length === fields.length && fields.every((field) => field in input); }

async function waitFor<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
    promise.then((value) => { signal.removeEventListener('abort', abort); resolve(value); },
      (error: unknown) => { signal.removeEventListener('abort', abort); reject(error); });
    if (signal.aborted) abort();
  });
}

async function body(response: Response, signal: AbortSignal, limit: number): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new WalletCoreError('wallet/unavailable');
  const chunks: Uint8Array[] = []; let length = 0; let finished = false;
  try {
    while (true) {
      const result = await waitFor(reader.read(), signal);
      if (result.done) { finished = true; break; }
      length += result.value.byteLength;
      if (length > limit) throw new WalletCoreError('wallet/unavailable');
      chunks.push(result.value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } finally {
    // A stalled stream cancellation must not defeat the operation's deadline.
    if (!finished) void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** One bounded operation, including token acquisition, requests and response bodies.
 * No cross-request state, redirects, cookies, polling or automatic network retries.
 * getToken is supplied by a captured Firebase session, never from local storage.
 */
export function walletTransport(config: EnabledAuthConfig, getToken: () => Promise<string>, inputSignal: AbortSignal,
  profile: 'default' | 'chain-read' | 'transfer-preparation' | 'transfer-command' | 'money' = 'default') {
  if (config.mode !== 'firebase') throw new WalletCoreError('wallet/unavailable');
  const api = new URL(config.apiOrigin ?? 'https://invalid.test');
  if (api.origin !== config.deployment.api_origin || api.pathname !== '/'
      || api.search || api.hash || api.username || api.password) throw new WalletCoreError('wallet/unavailable');
  // Fixed local profiles, never limits chosen by a remote response or user input.
  const transfer = profile === 'transfer-preparation';
  const signal = AbortSignal.any([inputSignal, AbortSignal.timeout(profile !== 'default' ? 50_000 : 15_000)]);
  async function request(path: string, method: 'GET' | 'POST', payload: object = {}, account?: AccountReleaseContext | 'identity', idempotencyKey?: string) {
    // Only resource paths authored by our resource clients; never a server-provided URL.
    if (!path.startsWith('/') || path.startsWith('//') || /[\\#\r\n]/.test(path)) throw new WalletCoreError('wallet/unavailable');
    if (idempotencyKey !== undefined && (method !== 'POST' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$(?![\s\S])/.test(idempotencyKey))) throw new WalletCoreError('wallet/unavailable');
    const url = new URL(`${api.origin}/app/v1${path}`);
    if (url.origin !== api.origin || !url.pathname.startsWith('/app/v1/')) throw new WalletCoreError('wallet/unavailable');
    const serialized = method === 'POST' ? JSON.stringify(payload) : undefined;
    signal.throwIfAborted();
    const token = await waitFor(getToken(), signal);
    signal.throwIfAborted();
    const response = await waitFor(fetch(url.href, {
      method, credentials: 'omit', cache: 'no-store', redirect: 'error', signal,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
        ...(method === 'POST' || account ? clientMutationHeaders(config.environment, account === 'identity' ? undefined : account) : {}) },
      ...(method === 'POST' ? { body: serialized } : {}),
    }), signal);
    if (response.status === 401) { void response.body?.cancel().catch(() => undefined); throw new WalletCoreError('auth/unauthenticated'); }
    if (response.status === 409 && response.headers.get(CLIENT_STATUS_HEADER) === 'update-required') {
      void response.body?.cancel().catch(() => undefined); throw new WalletCoreError('client/update-required');
    }
    return { status: response.status, value: await body(response, signal, transfer ? 1_000_000 : profile === 'money' ? 350_000 : 32_768) };
  }
  return { request };
}
