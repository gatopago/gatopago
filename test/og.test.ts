import { afterEach, describe, expect, it, vi } from 'vitest';

// Outside Next there is no request: the texts come straight from the catalogs.
vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl');
  const catalogs = {
    es: (await import('../src/messages/es.json')).default,
    en: (await import('../src/messages/en.json')).default,
  };
  return {
    getTranslations: async ({ locale, namespace }: { locale: 'es' | 'en'; namespace: string }) =>
      createTranslator({ locale, messages: catalogs[locale], namespace: namespace as 'Metadata' }),
  };
});

// Flow and Wallet Core are simulated: one payment link and one public profile.
const intent = {
  id: `pi_${'a'.repeat(32)}`,
  amount: '1280.50',
  status: 'requires_payment',
  description: '2 cafés + pan de queso',
  merchant: { name: 'Café Norte', address: '0x1111111111111111111111111111111111111111' },
};
const recipient = { username: 'dani', display_name: 'Daniel Cueto', address: '0x22' };

function serve({ fail = false } = {}) {
  const fetch = vi.fn(async (url: string) => {
    if (fail) throw new Error('unreachable');
    if (url.endsWith(`/checkout/v1/${intent.id}`)) return Response.json(intent);
    if (url.endsWith('/app/v1/recipients/dani')) return Response.json(recipient);
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
afterEach(() => vi.unstubAllGlobals());

/** The size of a PNG, from its header. */
async function pngSize(response: Response) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  const view = new DataView(bytes.buffer);
  expect([...bytes.slice(1, 4)].map((byte) => String.fromCharCode(byte)).join('')).toBe('PNG');
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

describe('shared-link previews', () => {
  it('say who charges, how much and for what, in each language', async () => {
    serve();
    const { paymentMetadata } = await import('../src/lib/metadata');
    const preview = (locale: string) =>
      paymentMetadata({ params: Promise.resolve({ locale, id: intent.id }) });
    const es = await preview('es');
    expect(es.openGraph?.title).toBe('Café Norte te cobra 1280,50 USDC');
    expect(es.openGraph?.description).toBe(
      '2 cafés + pan de queso · Paga con GatoPago o con cualquier wallet.',
    );
    expect(es.robots).toEqual({ index: false, follow: false });
    expect(JSON.stringify(es.openGraph?.images)).toContain(`/og/es/pay/${intent.id}`);
    const en = await preview('en');
    expect(en.openGraph?.title).toBe('Café Norte is charging you 1,280.50 USDC');
    expect(JSON.stringify(en.openGraph?.images)).toContain(`/og/en/pay/${intent.id}`);
    expect(en.openGraph?.url).toBe(`/en/pay/${intent.id}`);
  });

  it('fall back to a generic preview when Flow does not answer, and never fetch a bad id', async () => {
    const fetch = serve({ fail: true });
    const { paymentMetadata } = await import('../src/lib/metadata');
    const { paymentPreview } = await import('../src/og/data');
    const metadata = await paymentMetadata({
      params: Promise.resolve({ locale: 'es', id: intent.id }),
    });
    expect(metadata.openGraph?.title).toBe('Te enviaron un link de cobro de GatoPago');
    fetch.mockClear();
    expect(await paymentPreview('pi_../../app/v1/me')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('name a public profile with the name its owner chose', async () => {
    serve();
    const { profileMetadata } = await import('../src/lib/metadata');
    const metadata = await profileMetadata({
      params: Promise.resolve({ locale: 'es', username: '%40dani' }),
    });
    expect(metadata.openGraph?.title).toBe('Págale a @dani en GatoPago');
    expect(metadata.openGraph?.description).toBe(
      'Daniel Cueto recibe dólares digitales con GatoPago.',
    );
    expect(JSON.stringify(metadata.openGraph?.images)).toContain('/og/es/profile/dani');
  });

  it('give the landing and the static pages their own card', async () => {
    const { publicMetadata, staticMetadata } = await import('../src/lib/metadata');
    const params = (locale: string) => ({ params: Promise.resolve({ locale }) });
    expect(JSON.stringify((await publicMetadata(params('en'))).openGraph?.images)).toContain(
      '/og/en/home',
    );
    expect(
      JSON.stringify((await staticMetadata('docs')(params('es'))).openGraph?.images),
    ).toContain('/og/es/developers');
    const demo = await staticMetadata('demo')(params('es'));
    expect(demo.openGraph?.title).toBe('Café Norte te cobra 18,00 USDC');
    expect(JSON.stringify(demo.openGraph?.images)).toContain('/og/es/demo');
  });

  it('draw every card at 1200 × 630, generic when the data is missing', async () => {
    serve();
    const { pageImage, paymentImage, profileImage } = await import('../src/og/card');
    const { paymentPreview, profilePreview } = await import('../src/og/data');
    const cards = [
      await pageImage('es', 'home'),
      await pageImage('en', 'developers'),
      await pageImage('es', 'demo'),
      await paymentImage('es', await paymentPreview(intent.id)),
      await paymentImage('en', null),
      await profileImage('es', await profilePreview('dani')),
      await profileImage('en', null),
    ];
    for (const card of cards) {
      expect(card.headers.get('content-type')).toBe('image/png');
      expect(await pngSize(card)).toEqual({ width: 1200, height: 630 });
    }
    // A missing charge is retried soon; a real one is kept, since its amount never changes.
    expect(cards[3].headers.get('cache-control')).toContain('s-maxage=2592000');
    expect(cards[4].headers.get('cache-control')).toContain('max-age=60');
  }, 60_000);
});
