import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BrowserAuth } from '../src/auth/browser';
import type { EnabledAuthConfig } from '../src/auth/config';
import { PasskeyAccess } from '../src/auth/PasskeyAccess';

vi.mock('../src/auth/Turnstile', () => ({ Turnstile: () => null }));
afterEach(() => vi.unstubAllGlobals());

describe('operator-defined invitation form', () => {
  it.each([false, true])('shows the same 3–30 username policy in each language (English: %s)', english => {
    vi.stubGlobal('window', { location: { hash: '#invite=daniel' } });
    const html = renderToStaticMarkup(createElement(PasskeyAccess, {
      runtime: {} as BrowserAuth, config: { mode: 'firebase' } as EnabledAuthConfig,
      english, onSignedIn: vi.fn(), onRegistered: vi.fn(),
    }));
    const input = html.match(/<input\b[^>]*id="signup-username"[^>]*>/)?.[0];
    expect(input).toContain('pattern="[a-z][a-z0-9_]{2,29}"');
    expect(input).toContain('minLength="3"');
    expect(input).toContain('maxLength="30"');
    expect(html).toContain(english ? '3–30 characters' : '3–30 caracteres');
    expect(html).not.toContain('5–30');
  });
  it.each(['123', 'daniel', 'team1', 'a', 'hello world', "O'Brien", 'café 🐈', '<text & "quotes">', ' padded ', 'x'.repeat(120)])('prefills %s without imposing a token format', code => {
      vi.stubGlobal('window', { location: { hash: `#${new URLSearchParams({ invite: code })}` } });
      const html = renderToStaticMarkup(createElement(PasskeyAccess, {
        runtime: {} as BrowserAuth,
        config: { mode: 'firebase' } as EnabledAuthConfig,
        english: false,
        onSignedIn: vi.fn(),
        onRegistered: vi.fn(),
      }));
      const input = html.match(/<input\b[^>]*id="signup-invite"[^>]*>/)?.[0];
      expect(input).toBeDefined();
      expect(input).toContain('required=""');
      expect(input).not.toMatch(/\b(?:pattern|maxLength|minLength)=/i);
      const escaped = code.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;')
        .replaceAll('<', '&lt;').replaceAll('>', '&gt;');
      expect(input).toContain(`value="${escaped}"`);
      expect(html).toContain('Crear cuenta');
    });
});
