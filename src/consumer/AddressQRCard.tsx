'use client';

import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { copyText } from '../lib/clipboard';
import { shortAddress } from '../wallet/account';

/** V2's address QR with its copy row, shared by every "show my address" surface. */
export function AddressQRCard({
  address,
  chainId,
  english: en,
  qrSize = 188,
}: {
  address: string;
  chainId?: number;
  english: boolean;
  qrSize?: number;
}) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  return (
    <>
      <div
        className="mb-5 flex justify-center"
        role="img"
        aria-label={en ? 'Your address' : 'Tu dirección'}
      >
        <div className="border-2 border-text bg-white p-3 shadow-[6px_6px_0_var(--color-cat-700)]">
          <QRCodeSVG
            value={chainId ? `eip155:${chainId}:${address}` : address}
            size={qrSize}
            bgColor="#ffffff"
            fgColor="#0A0A0B"
            level="M"
          />
        </div>
      </div>
      <button
        type="button"
        onClick={() =>
          void copyText(address).then(
            () => {
              setCopyFailed(false);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            },
            () => setCopyFailed(true),
          )
        }
        className="interactive-surface flex w-full items-center justify-between gap-2 border-2 border-text bg-surface px-4 py-3 shadow-[4px_4px_0_var(--color-border)]"
      >
        <span className="truncate font-mono text-[13px] text-text">{shortAddress(address)}</span>
        <span className="shrink-0 text-[12px] font-semibold text-cat-300">
          {copied ? (en ? 'Copied ✓' : 'Copiada ✓') : en ? 'Copy address' : 'Copiar dirección'}
        </span>
      </button>
      {copyFailed && (
        <div className="mt-3 border-2 border-border bg-surface px-4 py-3">
          <p className="mb-1.5 text-[12px] text-text-muted">
            {en
              ? "Your browser didn't let us copy it. Hold the address to select and copy it:"
              : 'Tu navegador no nos dejó copiarla. Mantén presionada la dirección para seleccionarla y copiarla:'}
          </p>
          <p className="font-mono text-[13px] break-all text-text select-all">{address}</p>
        </div>
      )}
    </>
  );
}
