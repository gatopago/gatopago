import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../src/proxy';

/** Where the proxy sends a request: a redirect's address, or the page it renders in its place. */
function route(path: string, headers: Record<string, string> = {}) {
  const response = proxy(new NextRequest(`https://gatopago.com${path}`, { headers }));
  const location = response.headers.get('location');
  if (location) return { redirect: location.replace('https://gatopago.com', '') };
  const rewrite = response.headers.get('x-middleware-rewrite');
  return { renders: rewrite ? rewrite.replace('https://gatopago.com', '') : path };
}

describe('language of an address', () => {
  it('serves Spanish at the site’s own addresses and English under /en', () => {
    expect(route('/send', { 'accept-language': 'es-BO,es;q=0.9' })).toEqual({
      renders: '/es/send',
    });
    expect(route('/en/send', { 'accept-language': 'es-BO' })).toEqual({ renders: '/en/send' });
    expect(route('/en')).toEqual({ renders: '/en' });
    expect(route('/es/send')).toEqual({ redirect: '/send' });
  });

  it('follows the browser on a first visit, and Spanish when it says nothing, as crawlers do', () => {
    expect(route('/app', { 'accept-language': 'en-US,es;q=0.9' })).toEqual({
      redirect: '/en/app',
    });
    expect(route('/pay/pi_11111111111111111111111111111111')).toEqual({
      renders: '/es/pay/pi_11111111111111111111111111111111',
    });
    expect(route('/@dani')).toEqual({ renders: '/es/@dani' });
  });

  it('keeps the language chosen with the switch over the browser’s', () => {
    expect(route('/app', { 'accept-language': 'en-US', cookie: 'NEXT_LOCALE=es' })).toEqual({
      renders: '/es/app',
    });
  });

  it('opens links from before English had its own addresses in English, whatever the browser', () => {
    const spanish = { 'accept-language': 'es-BO' };
    expect(route('/statement?lang=en', spanish)).toEqual({ redirect: '/en/statement' });
    expect(route('/send?username=ana&lang=en', spanish)).toEqual({
      redirect: '/en/send?username=ana',
    });
    expect(route('/?lang=en', spanish)).toEqual({ redirect: '/en' });
    expect(route('/en/docs?lang=en', spanish)).toEqual({ redirect: '/en/docs' });
  });
});

describe('files of the site', () => {
  it('never pass through the proxy, which would take them for pages in a language', async () => {
    const { readdirSync } = await import('node:fs');
    const { config } = await import('../src/proxy');
    const matcher = new RegExp(`^${config.matcher[0]}$`);
    const files = readdirSync('public', { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) =>
        `${entry.parentPath}/${entry.name}`.replaceAll('\\', '/').replace(/^public/, ''),
      );
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) expect(matcher.test(file), file).toBe(false);
    for (const page of ['/', '/en', '/send', '/en/@dani', '/pay/pi_0123'])
      expect(matcher.test(page), page).toBe(true);
  });
});
