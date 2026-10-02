import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AuthScreen } from '../src/auth/AuthScreen';
import { CatGlyph } from '../src/marketing/CatGlyph';
import { MeliSprite } from '../src/marketing/MeliSprite';
import { PasskeyAccess } from '../src/auth/PasskeyAccess';
import type { BrowserAuth } from '../src/auth/browser';
import type { EnabledAuthConfig } from '../src/auth/config';
import { PwaControls } from '../src/pwa/PwaControls';
import { pwaMetadata } from '../src/pwa/manifest';

vi.mock('next/navigation', () => ({ useRouter: () => ({}), usePathname: () => '/login', useSearchParams: () => new URLSearchParams() }));

describe('Unified GatoPago presentation', () => {
  it('uses the official symbol instead of redrawing the logo', () => {
    const html = renderToStaticMarkup(createElement(CatGlyph));
    expect(html).toContain('src="/Logo_gatopago.svg"');
    expect(html).toContain('alt="GatoPago"');
    expect(readFileSync('public/Logo_gatopago.svg', 'utf8')).toContain('viewBox="0 0 30 23"');
    expect(renderToStaticMarkup(createElement(CatGlyph, { decorative: true }))).toContain('alt=""');
  });

  it('renders all 14 package sprites with explicit native dimensions', () => {
    const dimensions = {
      'body-conveyor': [477, 420], 'body-courier': [430, 428], 'body-peek-card': [435, 443],
      'body-qr': [348, 466], 'body-sitting': [304, 429], 'body-sleeping': [427, 343],
      'head-cautious': [376, 280], 'head-curious': [366, 349], 'head-excited': [332, 332],
      'head-focused': [330, 314], 'head-happy': [329, 314], 'head-neutral': [330, 314],
      'head-peek': [204, 343], 'head-sleepy': [343, 314],
    } as const;
    for (const variant of Object.keys(dimensions) as (keyof typeof dimensions)[]) {
      const html = renderToStaticMarkup(createElement(MeliSprite, { variant }));
      expect(html).toContain(`width="${dimensions[variant][0]}"`);
      expect(html).toContain(`height="${dimensions[variant][1]}"`);
      expect(html).toContain('aria-hidden="true"');
    }
  });

  it('keeps access separate from account navigation without hiding safety notices', () => {
    for (const english of [false, true]) {
      const html = renderToStaticMarkup(createElement(AuthScreen, {
        config: { mode: 'disabled' }, view: 'login', english,
        art: createElement(MeliSprite, { variant: 'body-sitting' }),
      }));
      expect(html).toContain('auth-login-grid');
      expect(html).toContain('auth-frame');
      expect(html).toContain(`href="${english ? '/en' : '/'}"`);
      expect(html).not.toContain('href="/settings');
      expect(html).toContain(english ? 'Do not send funds' : 'No envíes fondos');
      expect(html).toContain('btn btn-ghost btn-block');
    }
  });

  it('uses shared buttons for passkey options, without performing authentication', () => {
    const html = renderToStaticMarkup(createElement(PasskeyAccess, {
      runtime: {} as BrowserAuth, config: { mode: 'firebase' } as EnabledAuthConfig,
      english: false, onSignedIn: () => { throw new Error('Presentation must not sign in'); },
    }));
    expect(html).toContain('auth-primary btn btn-primary btn-block');
    expect(html).toContain('auth-secondary btn btn-ghost btn-block');
    expect(html).toContain('Entrar con passkey');
  });

  it('does not offer a blank account screen when identity is unavailable', () => {
    for (const english of [false, true]) {
      const html = renderToStaticMarkup(createElement(AuthScreen, {
        config: { mode: 'disabled' }, view: 'account', english, art: null,
      }));
      expect(html).toContain(english ? 'Opening sign-in' : 'Abriendo el acceso');
      expect(html).not.toContain('Entra para ver tu cuenta');
      expect(html).not.toContain('href="/settings');
    }
  });

  it('restores the phone-first login structure and desktop notice without fake auth methods', () => {
    const html = renderToStaticMarkup(createElement(AuthScreen, {
      config: { mode: 'disabled' }, view: 'login', english: false,
      art: createElement(MeliSprite, { variant: 'body-sitting' }),
    }));
    expect(html).toContain('auth-login-hero');
    expect(html).toContain('Entrar o crear cuenta');
    expect(html).toContain('Mejor en tu teléfono');
    expect(html).toContain('Continuar en computadora');
    expect(html).not.toContain('Continuar con Google');
    expect(html).not.toContain('Continuar con correo');
    expect(readFileSync('src/auth/auth.css', 'utf8')).not.toContain('58rem');
  });

  it('applies shared buttons beyond login and uses a widget that fits narrow forms', () => {
    for (const source of ['src/wallet/TransferForm.tsx', 'src/wallet/SecurityEnrollment.tsx', 'src/consumer/ProfileEditor.tsx', 'src/consumer/PublicUsername.tsx']) {
      const text = readFileSync(source, 'utf8');
      expect(text).not.toMatch(/className="auth-(primary|secondary)"/);
      expect(text).toContain('auth-primary btn btn-primary btn-block');
    }
    expect(readFileSync('src/auth/Turnstile.tsx', 'utf8')).toContain("size: 'compact'");
  });

  it('keeps the compact installation control accessible and the proper web icon formats', () => {
    const html = renderToStaticMarkup(createElement(PwaControls, { compact: true }));
    expect(html).toContain('aria-label="Instalar app"');
    expect(html).toContain('pwa-controls--compact');
    expect(JSON.stringify(pwaMetadata.icons)).toContain('image/svg+xml');
    expect(JSON.stringify(pwaMetadata.icons)).toContain('image/x-icon');
    const apple = readFileSync('public/apple-touch-icon.png');
    expect(apple.readUInt32BE(16)).toBe(180);
    expect(apple.readUInt32BE(20)).toBe(180);
    expect(readFileSync('public/favicon.svg', 'utf8')).not.toContain('Gradient');
  });
});
