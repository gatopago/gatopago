'use client';

import { useEffect, useState } from 'react';
import type { ClientSettings } from '../lib/settings';
import { useCopy } from '../lib/useCopy';
import { networkName } from '../wallet/account';
import { api, type Recipient } from '../wallet/api';
import { failureMessage } from '../wallet/messages';
import { ConsumerFrame } from './ConsumerFrame';
import { NavigationLink } from './NavigationLink';
import { Panel } from './Primitives';
import { localizedPath } from './routes';
import { CatGlyph } from '../marketing/CatGlyph';
import { ScreenLoading } from './Skeleton';

/** `/@username`: who receives payments to this username, and where. */
export function PublicUsername({
  username,
  settings,
  english: en,
}: {
  username: string;
  settings: ClientSettings;
  english: boolean;
}) {
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [error, setError] = useState('');
  const { copy, label, failed } = useCopy(en);
  useEffect(() => {
    const controller = new AbortController();
    api<Recipient>(settings.apiOrigin, `recipients/${username}`, { signal: controller.signal })
      .then(setRecipient)
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(failureMessage(failure, en));
      });
    return () => controller.abort();
  }, [settings, username, en]);
  return (
    <ConsumerFrame english={en} presentation="public">
      <div className="auth-content">
        {error ? <p role="alert">{error}</p> : null}
        {!recipient && !error ? <ScreenLoading kind="detail" english={en} bar={false} /> : null}
        {recipient ? (
          <>
            <div className="flex flex-col items-center py-6 text-center">
              <div
                className="mb-5 grid h-20 w-20 place-items-center border-2 border-text bg-cat-500 font-display text-[32px] uppercase text-on-cat shadow-[6px_6px_0_var(--color-cat-700)]"
                aria-hidden="true"
              >
                {(recipient.display_name || recipient.username)[0]}
              </div>
              <h1 className="mb-1 font-display text-[28px]">
                {recipient.display_name || `@${recipient.username}`}
              </h1>
              {recipient.display_name ? (
                <p className="mb-3 text-[15px] text-text-muted">@{recipient.username}</p>
              ) : null}
              <p className="text-[14px] text-text-muted">
                {en ? 'Receives payments with GatoPago' : 'Recibe pagos con GatoPago'}
              </p>
              {recipient.social_url ? (
                <a
                  href={recipient.social_url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="mt-3 break-all px-6 text-[13px] text-info underline underline-offset-2"
                >
                  {recipient.social_url.replace(/^https:\/\//, '')}
                </a>
              ) : null}
            </div>
            <Panel className="meli-paper-card--strong">
              <p className="mb-2 text-[12px] text-text-faint">
                {en ? 'Receiving address' : 'Dirección para recibir'}
              </p>
              <p className="mb-4 break-all font-mono text-[12px]">{recipient.address}</p>
              <button
                type="button"
                className="auth-secondary btn btn-ghost btn-block"
                onClick={() => copy(recipient.address)}
              >
                {label(en ? 'Copy address' : 'Copiar dirección')}
              </button>
              {failed() ? (
                <p role="alert" className="mt-3 text-[12px] text-danger">
                  {en
                    ? 'Select the address above to copy it.'
                    : 'Selecciona la dirección de arriba para copiarla.'}
                </p>
              ) : null}
              <p className="mt-4 text-[12px] leading-relaxed text-text-muted">
                {en
                  ? `Send only USDC, on ${settings.networks.map(networkName).join(', ')}.`
                  : `Envía solo USDC, en ${settings.networks.map(networkName).join(', ')}.`}
              </p>
            </Panel>
            <NavigationLink
              className="auth-primary btn btn-primary btn-block"
              href={localizedPath(`/send?username=${recipient.username}`, en)}
            >
              {en ? 'Pay with GatoPago' : 'Pagar con GatoPago'}
            </NavigationLink>
            <p className="mt-5 flex items-center justify-center gap-2 text-[12px] text-text-muted">
              <CatGlyph className="w-6" decorative />
              {en ? 'Your passkey authorizes each payment' : 'Tu passkey autoriza cada pago'}
            </p>
          </>
        ) : null}
      </div>
    </ConsumerFrame>
  );
}
