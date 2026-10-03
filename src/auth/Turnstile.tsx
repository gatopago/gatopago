'use client';

import Script from 'next/script';
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { createChallengeLifecycle, type ChallengeState } from './turnstile-lifecycle';
import { useCspNonce } from '../security/NonceProvider';
import { AccessError } from './passkey-client';

type TurnstileApi = {
  render(container: HTMLElement, options: {
    sitekey: string; action: 'signup'; theme: 'light'; size: 'compact'; retry: 'never';
    'refresh-expired': 'manual'; 'refresh-timeout': 'manual';
    callback(token: string): void;
    'expired-callback'(): void; 'error-callback'(): void;
    'timeout-callback'(): void; 'unsupported-callback'(): void;
  }): string;
  remove(id: string): void;
  reset(id: string): void;
};
declare global { interface Window { turnstile?: TurnstileApi } }

export type TurnstileHandle = { token(signal: AbortSignal): Promise<string> };
type PendingToken = { resolve(token: string): void; reject(error: unknown): void; cleanup(): void };

export function Turnstile({ siteKey, english, ref }: {
  siteKey: string; english: boolean; ref: Ref<TurnstileHandle>;
}) {
  const nonce = useCspNonce();
  const container = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [state, setState] = useState<ChallengeState>({ status: 'loading', token: null });
  const currentState = useRef(state);
  const controller = useRef<{ take(): string | null; retry(): void; fail(): void } | null>(null);
  const pending = useRef<PendingToken | null>(null);
  const finish = useCallback((error: unknown, token?: string) => {
    const request = pending.current;
    if (!request) return;
    pending.current = null; request.cleanup();
    if (token) request.resolve(token); else request.reject(error);
  }, []);
  useImperativeHandle(ref, () => ({
    token(signal) {
      signal.throwIfAborted();
      const token = controller.current?.take();
      if (token) return Promise.resolve(token);
      if (pending.current) return Promise.reject(new AccessError('auth/security-check-unavailable'));
      return new Promise<string>((resolve, reject) => {
        const abort = () => finish(signal.reason);
        pending.current = { resolve, reject, cleanup: () => signal.removeEventListener('abort', abort) };
        signal.addEventListener('abort', abort, { once: true });
        if (currentState.current.status !== 'loading') controller.current?.retry();
      });
    },
  }), [finish]);
  useEffect(() => () => finish(new AccessError('auth/security-check-unavailable')), [finish]);
  useEffect(() => {
    let widget: string | undefined;
    let active = true;
    let timer: number;
    const publish = (value: ChallengeState) => {
      currentState.current = value; setState(value);
      if (value.status === 'error' || value.status === 'expired') {
        window.clearTimeout(timer); finish(new AccessError('auth/security-check-unavailable'));
      }
    };
    let lifecycle = createChallengeLifecycle(publish);
    const start = () => {
      lifecycle.dispose(); window.clearTimeout(timer);
      lifecycle = createChallengeLifecycle(publish);
      publish({ status: 'loading', token: null });
      timer = window.setTimeout(() => lifecycle.invalidate('error'), scriptReady ? 60_000 : 15_000);
    };
    const fail = () => lifecycle.invalidate('error');
    controller.current = {
      take: () => lifecycle.take(), fail,
      retry() {
        start();
        if (widget !== undefined) {
          try { window.turnstile?.reset(widget); } catch { fail(); }
        }
      },
    };
    queueMicrotask(() => {
      if (!active) return;
      start();
      if (!scriptReady) return;
      try {
        if (!container.current || !window.turnstile) throw new Error('Turnstile unavailable');
        widget = window.turnstile.render(container.current, {
          sitekey: siteKey, action: 'signup', theme: 'light', size: 'compact', retry: 'never',
          'refresh-expired': 'manual', 'refresh-timeout': 'manual',
          callback: (token) => {
            if (!active) return;
            window.clearTimeout(timer); lifecycle.verified(token);
            if (pending.current) {
              const available = lifecycle.take();
              if (available) finish(null, available);
            }
          },
          'expired-callback': () => lifecycle.invalidate('expired'),
          'error-callback': fail,
          'timeout-callback': fail,
          'unsupported-callback': fail,
        });
      } catch { lifecycle.invalidate('error'); }
    });
    return () => {
      active = false; lifecycle.dispose(); window.clearTimeout(timer);
      controller.current = null;
      if (widget !== undefined) { try { window.turnstile?.remove(widget); } catch { /* Already removed. */ } }
    };
  }, [siteKey, scriptReady, finish]);
  const failed = state.status === 'error' || state.status === 'expired';
  return <div className="auth-challenge">
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" nonce={nonce}
      onReady={() => setScriptReady(true)} onError={() => controller.current?.fail()} />
    <div ref={container} />
    {state.status === 'loading' ? <p role="status">{english ? 'Checking security…' : 'Comprobando seguridad…'}</p> : null}
    {failed ? <p role="status">{english ? 'Select Create account to retry the security check.' : 'Pulsa Crear cuenta para reintentar la comprobación de seguridad.'}</p> : null}
  </div>;
}
