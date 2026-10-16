'use client';

import { QRCodeSVG } from 'qrcode.react';
import { useCopy } from '../lib/useCopy';
import { shortAddress } from '../wallet/account';
import { useTranslations } from 'next-intl';

/**
 * The QR of an address: a payment request for one coin (EIP-681) when Receive chose it: `token` is
 * its contract, or null for the network's own coin. Without a coin, the address and its network.
 */
function qrValue(address: string, chainId?: number, token?: string | null) {
  if (chainId === undefined) return address;
  if (token === undefined) return `eip155:${chainId}:${address}`;
  return token
    ? `ethereum:${token}@${chainId}/transfer?address=${address}`
    : `ethereum:${address}@${chainId}`;
}

/** V2's address QR with its copy row, shared by every "show my address" surface. */
export function AddressQRCard({
  address,
  chainId,
  token,
  qrSize = 188,
}: {
  address: string;
  chainId?: number;
  token?: string | null;
  qrSize?: number;
}) {
  const t = useTranslations('AddressQRCard');
  const { copy, label } = useCopy();
  return (
    <>
      <div className="mb-5 flex justify-center" role="img" aria-label={t('address')}>
        <div className="border-2 border-text bg-white p-3 shadow-[6px_6px_0_var(--color-cat-700)]">
          <QRCodeSVG
            value={qrValue(address, chainId, token)}
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
          {label(t('copyAddress'))}
        </span>
      </button>
    </>
  );
}
