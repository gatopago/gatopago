'use client';

import { useEffect, useState } from 'react';
import { crosschainFee } from '@gatopago/shared/crosschain';
import type { ClientSettings } from '../lib/settings';
import { cctpNetwork, networkName } from '../wallet/account';
import { formatBalance, useBalances } from '../wallet/balances';
import type { Session } from '../wallet/session';
import { NavigationLink } from './NavigationLink';
import { localizedPath } from './routes';

/**
 * USDC lives on the home network: what arrived on another one (or on Stellar) is said here, with
 * the way to bring it, one network at a time. Circle charges each crossing, so an amount that does
 * not cover its fee is only mentioned.
 */
export function ElsewhereNote({
  settings,
  session,
  english: en,
  className = '',
}: {
  settings: ClientSettings;
  session: Session;
  english: boolean;
  className?: string;
}) {
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
  // What crossing each one costs; `null` when Circle could not say (the move screen checks again).
  const [fees, setFees] = useState<Record<string, bigint | null>>({});
  const key = elsewhere.map(([id, amount]) => `${id}:${amount}`).join(',');
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    for (const pair of key.split(',')) {
      const [id, amount] = [
        pair.slice(0, pair.lastIndexOf(':')),
        pair.slice(pair.lastIndexOf(':') + 1),
      ];
      crosschainFee(cctpNetwork(id), cctpNetwork(home), BigInt(amount), controller.signal)
        .then((fee) => setFees((current) => ({ ...current, [id]: fee })))
        .catch(() => {
          if (!controller.signal.aborted) setFees((current) => ({ ...current, [id]: null }));
        });
    }
    return () => controller.abort();
  }, [key, home]);

  if (!elsewhere.length) return null;
  // Worth bringing: it covers its crossing. A fee Circle did not report does not hide the link.
  const bringable = ([id, amount]: readonly [string, bigint]) =>
    id in fees && (fees[id] === null || amount > fees[id]!);
  const bring = (id: string, label: string) => (
    <NavigationLink
      key={id}
      href={localizedPath(`/crosschain?from=${encodeURIComponent(id)}`, en)}
      className="font-semibold text-cat-700 underline underline-offset-2"
    >
      {label}
    </NavigationLink>
  );

  if (elsewhere.length === 1) {
    const [only] = elsewhere;
    return (
      <p className={`text-[12px] leading-relaxed text-text-muted ${className}`}>
        {en
          ? `You also have ${formatBalance(only[1], en)} USDC on ${networkName(only[0])}.`
          : `Tienes además ${formatBalance(only[1], en)} USDC en ${networkName(only[0])}.`}
        {bringable(only) ? <> {bring(only[0], en ? 'Bring it' : 'Traerlos')}</> : null}
      </p>
    );
  }
  // Several networks: each says how much and brings only its own.
  const total = elsewhere.reduce((sum, [, amount]) => sum + amount, 0n);
  return (
    <p className={`text-[12px] leading-relaxed text-text-muted ${className}`}>
      {en
        ? `You also have ${formatBalance(total, en)} USDC on other networks: `
        : `Tienes además ${formatBalance(total, en)} USDC en otras redes: `}
      {elsewhere.map((entry, index) => (
        <span key={entry[0]}>
          {index ? ' · ' : null}
          {bringable(entry)
            ? bring(
                entry[0],
                en
                  ? `bring ${formatBalance(entry[1], en)} from ${networkName(entry[0])}`
                  : `traer ${formatBalance(entry[1], en)} de ${networkName(entry[0])}`,
              )
            : en
              ? `${formatBalance(entry[1], en)} on ${networkName(entry[0])}`
              : `${formatBalance(entry[1], en)} en ${networkName(entry[0])}`}
        </span>
      ))}
    </p>
  );
}
