'use client';

import { formatBalance } from '../wallet/balances';
import { NavigationLink } from './NavigationLink';
import { localizedPath } from './routes';

/**
 * USDC on the account's other networks, which this screen cannot use. Said out loud so its
 * "available" does not look smaller than the home balance for no reason, with the way to bring it.
 */
export function ElsewhereNote({
  balances,
  networkId,
  english: en,
  className = '',
}: {
  balances: Record<string, bigint | null | undefined>;
  /** The network this screen works on. */
  networkId: string;
  english: boolean;
  className?: string;
}) {
  const elsewhere = Object.entries(balances).filter(
    (entry): entry is [string, bigint] =>
      entry[0] !== networkId && typeof entry[1] === 'bigint' && entry[1] > 0n,
  );
  if (!elsewhere.length) return null;
  const total = formatBalance(
    elsewhere.reduce((sum, [, balance]) => sum + balance, 0n),
    en,
  );
  const one = elsewhere.length === 1;
  return (
    <p className={`text-[12px] leading-relaxed text-text-muted ${className}`}>
      {en
        ? `You also have ${total} USDC on ${one ? 'another network' : 'other networks'}. `
        : `Tienes además ${total} USDC en ${one ? 'otra red' : 'otras redes'}. `}
      <NavigationLink
        href={localizedPath('/crosschain', en)}
        className="font-semibold text-cat-700 underline underline-offset-2"
      >
        {en ? 'Bring them here to use them' : 'Tráelos para usarlos aquí'}
      </NavigationLink>
    </p>
  );
}
