import { describe, expect, it } from 'vitest';
import { englishLocation, preferredLanguage } from '../src/lib/language';

describe('browser language', () => {
  it('follows the language the browser prefers most, by its weight', () => {
    expect(preferredLanguage('es-BO,es;q=0.9,en;q=0.8')).toBe('es');
    expect(preferredLanguage('en-US,es;q=0.9')).toBe('en');
    expect(preferredLanguage('es;q=0.5,en;q=0.9')).toBe('en');
    expect(preferredLanguage('pt-BR,pt;q=0.9')).toBe('en');
    expect(preferredLanguage('fr;q=0,es')).toBe('es');
  });

  it('keeps the Spanish default when the browser says nothing, as crawlers do', () => {
    expect(preferredLanguage(null)).toBeNull();
    expect(preferredLanguage('')).toBeNull();
    expect(preferredLanguage('*')).toBeNull();
  });
});

describe('English version of a page', () => {
  const at = (path: string) => {
    const url = new URL(path, 'https://gatopago.com');
    return englishLocation(url.pathname, url.searchParams);
  };

  it('uses the /en twin of the public pages, and ?lang=en everywhere else', () => {
    expect(at('/')).toBe('/en');
    expect(at('/docs')).toBe('/en/docs');
    expect(at('/terms')).toBe('/en/terms');
    expect(at('/app')).toBe('/app?lang=en');
    expect(at('/pay/pi_11111111111111111111111111111111')).toBe(
      '/pay/pi_11111111111111111111111111111111?lang=en',
    );
    expect(at('/send?username=ana')).toBe('/send?username=ana&lang=en');
  });

  it('leaves a page that is already in English', () => {
    expect(at('/en')).toBeNull();
    expect(at('/en/privacy')).toBeNull();
    expect(at('/app?lang=en')).toBeNull();
  });
});
