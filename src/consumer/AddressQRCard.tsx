'use client';

import { QRCodeSVG } from 'qrcode.react';
import { useCopy } from '../lib/useCopy';
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
  const { copy, label } = useCopy(en);
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
        onClick={() => copy(address)}
        className="interactive-surface flex w-full items-center justify-between gap-2 border-2 border-text bg-surface px-4 py-3 shadow-[4px_4px_0_var(--color-border)]"
      >
        <span className="truncate font-mono text-[13px] text-text">{shortAddress(address)}</span>
        <span className="shrink-0 text-[12px] font-semibold text-cat-300">
          {label(en ? 'Copy address' : 'Copiar dirección')}
        </span>
      </button>
    </>
  );
}
