'use client';

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { NavigationLink } from './NavigationLink';
import { Sheet } from './Sheet';
import { localizedPath } from './routes';

/** The account at a glance, from the header: its QR and address, and the way to the profile. */
export function AccountDetailsSheet({
  address,
  english: en,
  onClose,
}: {
  address: string;
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
      <p className="mt-4 text-center text-[12px] leading-relaxed text-text-muted">
        {en ? 'To receive from an exchange, use ' : 'Para recibir desde un exchange, usa '}
        <NavigationLink
          href={localizedPath('/receive', en)}
          onClick={onClose}
          className="font-semibold text-cat-700 underline underline-offset-2"
        >
          {en ? 'Receive' : 'Recibir'}
        </NavigationLink>
        {en ? ': it tells you which network to choose.' : ': te dice qué red elegir.'}
      </p>
      <NavigationLink
        href={localizedPath('/profile', en)}
        onClick={onClose}
        className="btn btn-ghost btn-block mt-5"
      >
        {en ? 'My profile' : 'Mi perfil'}
      </NavigationLink>
      <button type="button" data-sheet-close className="mt-3 min-h-11 w-full text-[13px]">
        {en ? 'Close' : 'Cerrar'}
      </button>
    </Sheet>
  );
}
