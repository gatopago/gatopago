import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { OFFLINE_HTML, OFFLINE_HEADERS } from '../src/pwa/offline';
import { pwaHeaders, pwaManifest, PWA_ICONS } from '../src/pwa/manifest';

const origin = 'https://staging.gatopago.com';
const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const offline = () => new Response(OFFLINE_HTML, { headers: OFFLINE_HEADERS });
const js = (headers: Record<string, string> = {}, body = '/* public asset */') => new Response(body, {
  headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'public, max-age=31536000, immutable', ...headers },
});
type WorkerRequest = { url: string; headers: Headers; method: string; mode: string; destination: string };
function request(path: string, options: Partial<Omit<WorkerRequest, 'headers'>> & { headers?: Record<string, string> } = {}): WorkerRequest {
  return { url: new URL(path, origin).href, method: 'GET', mode: 'cors', destination: '', ...options, headers: new Headers(options.headers) };
}
function worker() {
  const handlers = new Map<string, (event: unknown) => void>();
  const contents = new Map<string, Map<string, Response>>();
  const cache = (name: string) => {
    if (!contents.has(name)) contents.set(name, new Map());
    const data = contents.get(name)!;
    const key = (input: string | Request) => typeof input === 'string' ? input : input.url;
    return {
      match: async (input: string | Request) => data.get(key(input))?.clone(),
      put: async (input: string | Request, response: Response) => { data.set(key(input), new Response(await response.arrayBuffer(), { status: response.status, headers: response.headers })); },
      keys: async () => [...data.keys()].map((url) => new Request(url)),
      delete: async (input: string | Request) => data.delete(key(input)),
    };
  };
  const caches = { open: vi.fn(async (name: string) => cache(name)), keys: async () => [...contents.keys()], delete: vi.fn(async (name: string) => contents.delete(name)) };
  const fetch = vi.fn(async () => js());
  const skipWaiting = vi.fn(); const claim = vi.fn();
  runInNewContext(source, {
    self: { location: { origin }, addEventListener: (name: string, callback: (event: unknown) => void) => handlers.set(name, callback), skipWaiting, clients: { claim } },
    caches, fetch, URL, Response, AbortSignal, setTimeout, clearTimeout,
  });
  function event(name: string, input?: WorkerRequest) {
    const pending: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    handlers.get(name)?.({ request: input, waitUntil: (task: Promise<unknown>) => pending.push(task), respondWith: (task: Promise<Response>) => { response = task; } });
    return { response, finish: async () => { const output = await response; await Promise.all(pending); return output; } };
  }
  return { event, fetch, caches, contents, handlers, skipWaiting, claim };
}

describe('actual public/sw.js in an isolated browser-API harness', () => {
  it('installs only the bounded neutral offline document; never activates over open tabs', async () => {
    const sw = worker(); sw.fetch.mockResolvedValue(offline());
    await sw.event('install').finish();
    expect([...sw.contents.get('gatopago-v3-pwa-1')!.keys()]).toEqual([`${origin}/offline`]);
    expect(sw.fetch).toHaveBeenCalledExactlyOnceWith(`${origin}/offline`, expect.objectContaining({ credentials: 'omit', redirect: 'error', cache: 'reload' }));
    expect(sw.skipWaiting).not.toHaveBeenCalled(); expect(sw.claim).not.toHaveBeenCalled();
    expect([...sw.handlers.keys()]).toEqual(['install', 'activate', 'fetch']);
  });
  it.each([
    new Response('login', { headers: { 'Content-Type': 'text/html' } }),
    new Response('not html', { headers: { ...OFFLINE_HEADERS, 'Content-Type': 'application/json' } }),
    new Response('x'.repeat(8193), { headers: OFFLINE_HEADERS }),
    new Response('unavailable', { status: 503, headers: OFFLINE_HEADERS }),
  ])('rejects unsafe/incomplete offline installation (%#)', async (response) => {
    const sw = worker(); sw.fetch.mockResolvedValue(response.clone());
    await expect(sw.event('install').finish()).rejects.toThrow('Neutral offline');
    expect(sw.contents.size).toBe(0);
  });
  it('cleans only its own older caches, preserving unrelated apps', async () => {
    const sw = worker();
    for (const key of ['gatopago-v3-pwa-old', 'gatopago-v3-pwa-1', 'other-app', 'firebase-cache']) await sw.caches.open(key);
    await sw.event('activate').finish();
    expect(await sw.caches.keys()).toEqual(['gatopago-v3-pwa-1', 'other-app', 'firebase-cache']);
    expect(sw.claim).not.toHaveBeenCalled();
  });
  it.each([
    request('/app/v1/transfer', { method: 'POST' }), request('/v1/payment_intents', { method: 'POST' }),
    request('/api/private', { mode: 'navigate' }), request('/app/v1/portfolio', { mode: 'navigate' }),
    request('/v1/quotes', { mode: 'navigate' }), request('/__/auth/handler', { mode: 'navigate' }),
    request('/__/auth/iframe', { mode: 'navigate' }), request('/app?_rsc=token', { mode: 'navigate' }),
    request('/app', { headers: { RSC: '1' } }), request('/app', { headers: { 'Next-Router-Prefetch': '1' } }),
    request('/app', { method: 'POST', headers: { 'Next-Action': 'test' } }),
    request('https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp'),
  ])('never intercepts/replays API, mutations, OAuth, Flight or third-party requests (%#)', async (input) => {
    const sw = worker(); const event = sw.event('fetch', input);
    expect(event.response).toBeUndefined(); await event.finish();
    expect(sw.fetch).not.toHaveBeenCalled(); expect(sw.contents.size).toBe(0);
  });
  it('documents are network-only and no-store even with a session or an action code', async () => {
    const sw = worker(); sw.fetch.mockResolvedValue(new Response('private identity', { headers: { 'Content-Type': 'text/html' } }));
    const input = request('/login?oobCode=never-persist', { mode: 'navigate', headers: { Cookie: 'session', Authorization: 'token' } });
    const response = await sw.event('fetch', input).finish();
    expect(await response!.text()).toBe('private identity');
    expect(sw.fetch).toHaveBeenCalledExactlyOnceWith(input, expect.objectContaining({ cache: 'no-store' }));
    expect(sw.contents.size).toBe(0);
  });
  it.each([401, 404, 500, 503])('does not conceal an HTTP %i behind the offline screen', async (status) => {
    const sw = worker(); sw.fetch.mockResolvedValue(new Response('actual error', { status }));
    expect((await sw.event('fetch', request('/app', { mode: 'navigate' })).finish())!.status).toBe(status);
    expect(sw.contents.size).toBe(0);
  });
  it('offline navigation uses only neutral HTML and never echoes sensitive URLs', async () => {
    const sw = worker(); sw.fetch.mockResolvedValue(offline()); await sw.event('install').finish();
    sw.fetch.mockRejectedValue(new TypeError('Network failed'));
    const response = await sw.event('fetch', request('/login?oobCode=secret', { mode: 'navigate' })).finish();
    expect(await response!.text()).toBe(OFFLINE_HTML);
    expect(OFFLINE_HTML).not.toContain('secret'); expect(OFFLINE_HTML).not.toContain('<script');
    expect(sw.fetch).toHaveBeenCalledTimes(2); // one installation, one navigation; no retries
  });
  it('storage failure does not break online assets or the fallback error', async () => {
    const sw = worker(); sw.caches.open.mockRejectedValue(new Error('Storage denied'));
    expect((await sw.event('fetch', request('/_next/static/chunks/abc123.js', { destination: 'script' })).finish())!.status).toBe(200);
    sw.fetch.mockRejectedValue(new TypeError('Offline'));
    const response = await sw.event('fetch', request('/app', { mode: 'navigate' })).finish();
    expect(response!.status).toBe(503); expect(response!.headers.get('Cache-Control')).toBe('no-store');
  });
  it('static cache hits omit credentials and avoid extra fetches', async () => {
    const sw = worker();
    const input = request('/_next/static/chunks/abc123.js', { destination: 'script' });
    await sw.event('fetch', input).finish(); await sw.event('fetch', input).finish();
    expect(sw.fetch).toHaveBeenCalledExactlyOnceWith(input, { credentials: 'omit' });
  });
  it.each([
    request('/_next/static/chunks/abc.js?user=1', { destination: 'script' }),
    request('/_next/static/chunks/abc.js', { destination: 'script', headers: { Authorization: 'private' } }),
    request('/_next/static/chunks/abc.js', { destination: 'script', headers: { Range: 'bytes=0-1' } }),
    request('/sw.js', { destination: 'script' }), request('/private.png', { destination: 'image' }),
    request('/manifest.webmanifest'), request('/account/receipt', { destination: '' }),
  ])('does not cache arbitrary or sensitive resource requests (%#)', async (input) => {
    const sw = worker(); expect(sw.event('fetch', input).response).toBeUndefined(); expect(sw.fetch).not.toHaveBeenCalled();
  });
  it.each<Record<string, string>>([
    { 'Cache-Control': 'private' }, { 'Cache-Control': 'no-store' }, { 'Set-Cookie': 'session' },
    { Vary: 'Cookie' }, { Vary: 'Authorization' }, { Vary: '*' }, { 'Content-Type': 'text/html' },
    { 'Content-Length': '9999999' },
  ])('returns but does not cache a prohibited asset response (%#)', async (headers) => {
    const sw = worker(); sw.fetch.mockResolvedValue(js(headers));
    const response = await sw.event('fetch', request('/_next/static/chunks/abc123.js', { destination: 'script' })).finish();
    expect(response!.status).toBe(200); expect(sw.contents.get('gatopago-v3-pwa-1')!.size).toBe(0);
  });
  it('rejects large bodies even without Content-Length', async () => {
    const sw = worker(); sw.fetch.mockResolvedValue(js({}, 'x'.repeat(512 * 1024 + 1)));
    const response = await sw.event('fetch', request('/_next/static/chunks/abc123.js', { destination: 'script' })).finish();
    expect((await response!.text()).length).toBe(512 * 1024 + 1);
    expect(sw.contents.get('gatopago-v3-pwa-1')!.size).toBe(0);
  });
  it('bounds an offline response body that never finishes', async () => {
    const sw = worker();
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('<html>')); } });
    sw.fetch.mockResolvedValue(new Response(stream, { headers: OFFLINE_HEADERS }));
    await expect(sw.event('install').finish()).rejects.toThrow('Neutral offline');
    expect(sw.contents.size).toBe(0);
  });
  it('caps retained assets at 40 while preserving the offline document', async () => {
    const sw = worker(); sw.fetch.mockResolvedValue(offline()); await sw.event('install').finish();
    sw.fetch.mockImplementation(async () => js());
    await Promise.all(Array.from({ length: 55 }, (_, index) => sw.event('fetch', request(`/_next/static/chunks/${index}.js`, { destination: 'script' })).finish()));
    const data = sw.contents.get('gatopago-v3-pwa-1')!;
    expect(data.size).toBeLessThanOrEqual(41); expect(data.has(`${origin}/offline`)).toBe(true);
  });
  it('never waits for cache persistence before delivering the network response', async () => {
    const sw = worker();
    const cache = await sw.caches.open('gatopago-v3-pwa-1');
    let resolve!: () => void; const held = new Promise<void>((done) => { resolve = done; });
    cache.put = async () => held; sw.caches.open.mockResolvedValue(cache);
    const event = sw.event('fetch', request('/_next/static/chunks/abc123.js', { destination: 'script' }));
    expect(await (await event.response)!.text()).toBe('/* public asset */');
    resolve(); await event.finish();
  });
});

describe('PWA public metadata', () => {
  it('uses the new /app identity and reviewed face-only Meli PNGs', () => {
    const manifest = pwaManifest();
    expect(manifest).toMatchObject({ id: '/app', start_url: '/app', scope: '/', display: 'standalone' });
    expect(manifest.name).toBe('GatoPago');
    expect(manifest.short_name).toBe('GatoPago');
    expect(manifest.description).toContain('no envíes fondos reales');
    for (const [file, size] of [[PWA_ICONS.small, 192], [PWA_ICONS.large, 512]] as const) {
      const bytes = readFileSync(new URL(`../public${file}`, import.meta.url));
      expect(bytes.readUInt32BE(16)).toBe(size); expect(bytes.readUInt32BE(20)).toBe(size);
    }
  });
  it('revalidates worker/manifest and offline HTML has a self-contained CSP', () => {
    expect(pwaHeaders()[0].headers).toContainEqual({ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' });
    expect(pwaHeaders()[1].headers[0].value).toContain('must-revalidate');
    expect(OFFLINE_HEADERS['Content-Security-Policy']).toContain("default-src 'none'");
    expect(OFFLINE_HEADERS['Content-Security-Policy']).toContain("style-src 'sha256-");
    expect(Buffer.byteLength(OFFLINE_HTML)).toBeLessThan(8192);
  });
});
