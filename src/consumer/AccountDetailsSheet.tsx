'use client';

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { networkName } from '../wallet/account';
import { NavigationLink } from './NavigationLink';
import { Sheet } from './Sheet';
import { localizedPath } from './routes';

export function AccountDetailsSheet({
  address,
  networks,
  english: en,
  onClose,
}: {
  address: string;
  networks: readonly string[];
  english: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  return (
    <Sheet titleId="account-details-title" onClose={onClose}>
      <div className="sheet-handle mb-5" aria-hidden="true" />
      <h2 id="account-details-title" className="meli-kicker mb-3">
        {en ? 'Your account' : 'Tu cuenta'}
      </h2>
      <p className="text-[13px] text-text-muted">
        {en ? 'One address on all your networks.' : 'Una dirección en todas tus redes.'}
      </p>
      <div className="meli-qr-card">
        <QRCodeSVG
          value={address}
          size={172}
          level="M"
          marginSize={4}
          title={en ? 'Your address QR' : 'QR de tu dirección'}
        />
      </div>
      <p className="mb-4 break-all text-center font-mono text-[12px]">{address}</p>
      <button
        type="button"
        className="btn btn-primary btn-block"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(address);
            setCopied(true);
            setError('');
          } catch {
            setError(
              en
                ? 'Select the address above to copy it.'
                : 'Selecciona la dirección de arriba para copiarla.',
            );
          }
        }}
      >
        {copied ? (en ? 'Copied' : 'Copiada') : en ? 'Copy address' : 'Copiar dirección'}
      </button>
      {error ? (
        <p role="alert" className="mt-3 text-[12px] text-danger">
          {error}
        </p>
      ) : null}
      <div className="my-5 border border-border bg-surface px-4 py-3">
        <p className="mb-2 text-[11px] uppercase tracking-wider text-text-faint">
          {en ? 'Your networks' : 'Tus redes'}
        </p>
        <ul className="space-y-2">
          {networks.map((network) => (
            <li key={network} className="flex items-center gap-2 text-[13px]">
              <span className="h-2 w-2 bg-growth" aria-hidden="true" />
              {networkName(network)}
            </li>
          ))}
        </ul>
      </div>
      <NavigationLink
        href={localizedPath('/profile', en)}
        onClick={onClose}
        className="btn btn-ghost btn-block"
      >
        {en ? 'My profile' : 'Mi perfil'}
      </NavigationLink>
      <button type="button" onClick={onClose} className="mt-3 min-h-11 w-full text-[13px]">
        {en ? 'Close' : 'Cerrar'}
      </button>
    </Sheet>
  );
}
