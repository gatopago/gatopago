'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { crosschainFee } from '@gatopago/shared/crosschain';
import type { ClientSettings } from '../lib/settings';
import { cctpNetwork, networkName } from '../wallet/account';
import { formatBalance, useBalances } from '../wallet/balances';
import type { Session } from '../wallet/session';
import { NavigationLink } from './NavigationLink';
import { NetworkIcon } from './TokenIcon';
import { useTranslations, useLocale } from 'next-intl';

/**
 * USDC lives on the home network: what arrived on another one (or on Stellar) is said here, with
 * the way to bring it, one network at a time. Circle charges each crossing, so an amount that does
 * not cover its fee is only mentioned.
 */
export function ElsewhereNote({
  settings,
  session,
  className = '',
}: {
  settings: ClientSettings;
  session: Session;
  className?: string;
}) {
  const locale = useLocale();
  const t = useTranslations('ElsewhereNote');
  const { balances, stellar, stellarUsdc } = useBalances(settings, session);
  const home = settings.homeNetwork;
  const elsewhere = [
    ...settings.networks.map((id) => [id, balances[id]] as const),
    ...(stellar && settings.stellar ? [[settings.stellar.network, stellarUsdc] as const] : []),
  ]
    .filter((entry): entry is readonly [string, bigint] => {
      const [id, amount] = entry;
      return id !== home && typeof amount === 'bigint' && amount > 0n;
    })
    .sort(([, a], [, b]) => (b > a ? 1 : -1));
  if (!elsewhere.length) return null;

  if (elsewhere.length === 1) {
    const [[id, amount]] = elsewhere;
    return (
      <p className={`text-[12px] leading-relaxed text-text-muted ${className}`}>
        {t('alsoUsdc', { amount: formatBalance(amount, locale), id: networkName(id) })}{' '}
        {/* Inline, but with a finger-sized target: the padding grows the tap area, not the line. */}
        <BringLink from={id} home={home} amount={amount} className="-my-3 inline-block py-3">
          {t('bring')}
        </BringLink>
      </p>
    );
  }
  // Several networks: one row each, with how much and a link that brings only its own.
  const total = elsewhere.reduce((sum, [, amount]) => sum + amount, 0n);
  return (
    <div className={`text-[12px] leading-relaxed text-text-muted ${className}`}>
      <p>{t('alsoUsdcOtherNetworks', { total: formatBalance(total, locale) })}</p>
      <ul>
        {elsewhere.map(([id, amount]) => (
          <li key={id} className="flex min-h-11 items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <NetworkIcon id={id} size={18} />
              <span className="truncate">
                {t('amountOn', { amount: formatBalance(amount, locale), network: networkName(id) })}
              </span>
            </span>
            <BringLink
              from={id}
              home={home}
              amount={amount}
              className="flex min-h-11 shrink-0 items-center px-1"
            >
              {t('bringShort')}
            </BringLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The link to bring one network's USDC home, gone once Circle's fee turns out larger than the
 * amount. Shown before the fee arrives, so the common case never changes.
 */
function BringLink({
  from,
  home,
  amount,
  className,
  children,
}: {
  from: string;
  home: string;
  amount: bigint;
  className: string;
  children: ReactNode;
}) {
  // `null` when Circle could not say: that does not hide the link (the move screen checks again).
  const [fee, setFee] = useState<bigint | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    crosschainFee(cctpNetwork(from), cctpNetwork(home), amount, controller.signal)
      .then(setFee)
      .catch(() => {
        if (!controller.signal.aborted) setFee(null);
      });
    return () => controller.abort();
  }, [from, home, amount]);
  if (fee !== null && amount <= fee) return null;
  return (
    <NavigationLink
      href={`/crosschain?from=${encodeURIComponent(from)}`}
      className={`font-semibold text-cat-700 underline underline-offset-2 ${className}`}
    >
      {children}
    </NavigationLink>
  );
}
