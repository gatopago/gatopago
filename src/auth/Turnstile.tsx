'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { createChallengeLifecycle, type ChallengeState } from './turnstile-lifecycle';
import { useCspNonce } from '../security/NonceProvider';

type TurnstileApi = {
  render(container: HTMLElement, options: {
    sitekey: string; action: 'signup'; theme: 'light'; size: 'compact'; retry: 'never';
    'refresh-expired': 'manual'; 'refresh-timeout': 'manual';
    callback(token: string): void;
    'expired-callback'(): void; 'error-callback'(): void;
    'timeout-callback'(): void; 'unsupported-callback'(): void;
  }): string;
  remove(id: string): void;
};
declare global { interface Window { turnstile?: TurnstileApi } }

export function Turnstile({ siteKey, onState, english }: {
  siteKey: string; onState: (state: ChallengeState) => void; english: boolean;
}) {
  const nonce = useCspNonce();
  const container = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<ChallengeState>({ status: 'loading', token: null });
  useEffect(() => {
    let widget: string | undefined;
    let active = true;
    const publish = (value: ChallengeState) => { setState(value); onState(value); };
    const lifecycle = createChallengeLifecycle(publish);
    const timer = window.setTimeout(() => lifecycle.invalidate('error'), 15_000);
    queueMicrotask(() => {
      if (!active) return;
      publish({ status: 'loading', token: null });
      if (!scriptReady) return;
      try {
        if (!container.current || !window.turnstile) throw new Error('Turnstile unavailable');
        widget = window.turnstile.render(container.current, {
          sitekey: siteKey, action: 'signup', theme: 'light', size: 'compact', retry: 'never',
          'refresh-expired': 'manual', 'refresh-timeout': 'manual',
          callback: (token) => { window.clearTimeout(timer); lifecycle.verified(token); },
          'expired-callback': () => lifecycle.invalidate('expired'),
          'error-callback': () => lifecycle.invalidate('error'),
          'timeout-callback': () => lifecycle.invalidate('error'),
          'unsupported-callback': () => lifecycle.invalidate('error'),
        });
      } catch { lifecycle.invalidate('error'); }
    });
    return () => {
      active = false; lifecycle.dispose(); window.clearTimeout(timer);
      if (widget !== undefined) { try { window.turnstile?.remove(widget); } catch { /* Already removed. */ } }
    };
  }, [siteKey, scriptReady, revision, onState]);
  const failed = state.status === 'error' || state.status === 'expired';
  return <div className="auth-challenge">
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" nonce={nonce}
      onReady={() => setScriptReady(true)} />
    <div ref={container} />
    {state.status === 'loading' ? <p role="status">{english ? 'Checking security…' : 'Comprobando seguridad…'}</p> : null}
    {failed ? <div role="alert"><p>{english ? 'Security check unavailable or expired.' : 'La comprobación falló o venció.'}</p>
      <button type="button" className="auth-secondary btn btn-ghost btn-block" onClick={() => {
        onState({ status: 'loading', token: null });
        if (!scriptReady) window.location.reload();
        else setRevision((value) => value + 1);
      }}>{english ? 'Retry verification' : 'Reintentar comprobación'}</button></div> : null}
  </div>;
}
