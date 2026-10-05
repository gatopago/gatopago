'use client';

import { useEffect, useState } from 'react';
import type { ClientSettings } from '../lib/settings';
import { networkName } from '../wallet/account';
import { api, type Recipient } from '../wallet/api';
import { failureMessage } from '../wallet/messages';
import { ConsumerFrame } from './ConsumerFrame';
import { NavigationLink } from './NavigationLink';
import { BackHeader, Panel } from './Primitives';
import { localizedPath } from './routes';

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
  const [recipient, setRecipient] = useState<Recipient | null>(null),
    [error, setError] = useState(''),
    [copied, setCopied] = useState(false);
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
    <ConsumerFrame english={en}>
      <div className="auth-content">
        <BackHeader title={`@${username}`} english={en} to={en ? '/en' : '/'} />
        {error ? <p role="alert">{error}</p> : null}
        {!recipient && !error ? <p role="status">{en ? 'Loading…' : 'Cargando…'}</p> : null}
        {recipient ? (
          <Panel>
            {recipient.display_name ? (
              <p className="font-display text-xl">{recipient.display_name}</p>
            ) : null}
            <p className="my-3 break-all font-mono text-sm">{recipient.address}</p>
            <button
              type="button"
              className="auth-secondary btn btn-ghost btn-block"
              onClick={() =>
                void navigator.clipboard?.writeText(recipient.address).then(() => setCopied(true))
              }
            >
              {copied ? (en ? 'Copied' : 'Copiada') : en ? 'Copy address' : 'Copiar dirección'}
            </button>
            <NavigationLink
              className="auth-primary btn btn-primary btn-block"
              href={localizedPath(`/send?username=${recipient.username}`, en)}
            >
              {en ? 'Pay with GatoPago' : 'Pagar con GatoPago'}
            </NavigationLink>
            <p className="mt-4 text-sm text-text-muted">
              {en
                ? `Send only USDC, on ${settings.networks.map(networkName).join(', ')}.`
                : `Envía solo USDC, en ${settings.networks.map(networkName).join(', ')}.`}
            </p>
          </Panel>
        ) : null}
      </div>
    </ConsumerFrame>
  );
}
