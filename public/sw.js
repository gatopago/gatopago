/* GatoPago V3: public assets + neutral offline document only. No monetary state. */
// Updates activate naturally after all controlled documents close, not on a payment screen.
const PREFIX = 'gatopago-v3-pwa-';
const CACHE = `${PREFIX}1`;
const MAX_ASSETS = 40;
const MAX_ASSET_BYTES = 512 * 1024;
const OFFLINE = new URL('/offline', self.location.origin).href;

async function withinLimit(response, max) {
  if (Number(response.headers.get('Content-Length')) > max) return false;
  const copy = response.clone();
  const reader = copy.body?.getReader();
  if (!reader) return false;
  let size = 0;
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Cache read timeout')), 2000);
  });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) return true;
      size += value.byteLength;
      if (size > max) return false;
    }
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    // A tee branch cancellation may await the other consumer. Never block it.
    reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const response = await fetch(OFFLINE, {
        cache: 'reload',
        credentials: 'omit',
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      });
      if (
        !response.ok ||
        response.headers.get('X-GatoPago-Offline') !== 'v3' ||
        !(response.headers.get('Content-Type') ?? '').startsWith('text/html') ||
        !(await withinLimit(response, 8192))
      ) {
        throw new Error('Neutral offline document unavailable');
      }
      const cache = await caches.open(CACHE);
      await cache.put(OFFLINE, response);
      // Never skipWaiting: an update must not replace the worker beneath open payment tabs.
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
      }
      // No clients.claim(), forced reload, sync handler or replay queue.
    })(),
  );
});

function canCacheAsset(request, url) {
  if (
    url.search ||
    url.pathname.includes('%') ||
    request.headers.has('Authorization') ||
    request.headers.has('Range') ||
    request.headers.has('RSC') ||
    request.headers.has('Next-Router-Prefetch') ||
    request.headers.has('Next-Action')
  )
    return false;
  if (!['script', 'style', 'font', 'image'].includes(request.destination)) return false;
  return (
    /^\/_next\/static\/(?:chunks|media)\/[A-Za-z0-9_./~-]+\.(?:js|css|woff2?|png|webp|svg)$/.test(
      url.pathname,
    ) || /^\/pwa\/meli-(?:192|512)-[a-f0-9]{12}\.png$/.test(url.pathname)
  );
}

async function cacheAsset(request, event) {
  // Cache denial/quota must not turn a working network request into an outage.
  const cache = await caches.open(CACHE).catch(() => null);
  const cached = await cache?.match(request.url).catch(() => undefined);
  if (cached) return cached;
  const response = await fetch(request, { credentials: 'omit' });
  const type = response.headers.get('Content-Type') ?? '';
  if (
    cache &&
    response.ok &&
    !response.redirected &&
    response.type !== 'opaque' &&
    /(?:javascript|css|font|image)/i.test(type) &&
    !/(?:private|no-store)/i.test(response.headers.get('Cache-Control') ?? '') &&
    !response.headers.has('Set-Cookie') &&
    !(response.headers.get('Vary') ?? '').match(/\*|cookie|authorization/i)
  ) {
    const copy = response.clone();
    event.waitUntil(
      (async () => {
        if (!(await withinLimit(copy, MAX_ASSET_BYTES))) {
          void copy.body?.cancel().catch(() => undefined);
          return;
        }
        await cache.put(request.url, copy);
        const keys = (await cache.keys()).filter((key) => key.url !== OFFLINE);
        for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)))
          await cache.delete(key);
      })().catch(() => undefined),
    );
  }
  return response;
}

async function navigate(request) {
  try {
    // Credentials may be needed for the document, but no private response is stored.
    return await fetch(request, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
  } catch {
    const offline = await caches
      .open(CACHE)
      .then((cache) => cache.match(OFFLINE))
      .catch(() => undefined);
    return (
      offline ??
      new Response('GatoPago: no connection. No operation was retried.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      })
    );
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Mutations, API, OAuth helpers, third parties and Flight retain their own network semantics.
  // In particular, never replace a Firebase helper or a Flight response with HTML.
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    /^\/(?:__|api|app\/v1|v1)(?:\/|$)/.test(url.pathname) ||
    url.searchParams.has('_rsc') ||
    request.headers.has('RSC') ||
    request.headers.has('Next-Router-Prefetch') ||
    request.headers.has('Next-Action')
  )
    return;
  if (request.mode === 'navigate') {
    event.respondWith(navigate(request));
    return;
  }
  if (canCacheAsset(request, url)) event.respondWith(cacheAsset(request, event));
});

// Payment notifications: FCM delivers a Web Push with `data` only (title, body, link); this worker
// shows it and tells open windows to read balances and activity again. No Firebase code runs here.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json().data ?? {};
  } catch {
    data = {};
  }
  if (data.type !== 'movement') return;
  event.waitUntil(
    Promise.all([
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
        for (const window of windows) window.postMessage({ type: 'GATOPAGO_MOVEMENT' });
      }),
      self.registration.showNotification(data.title || 'GatoPago', {
        body: data.body || '',
        icon: '/apple-touch-icon.png',
        data: { link: data.link || '/app' },
      }),
    ]),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Only same-origin paths open: a notification never navigates elsewhere.
  let link = '/app';
  try {
    const target = new URL(event.notification.data?.link ?? '/app', self.location.origin);
    if (target.origin === self.location.origin) link = `${target.pathname}${target.search}`;
  } catch {
    /* malformed links open Home */
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      for (const window of windows) {
        if ('focus' in window) {
          await window.navigate(link);
          return window.focus();
        }
      }
      return self.clients.openWindow(link);
    }),
  );
});
