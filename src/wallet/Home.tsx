'use client';

import { useEffect, useState } from 'react';
import { formatUnits } from 'viem';
import { EyeIcon, ReceiveIcon, ScanIcon, SendIcon } from '../consumer/Icons';
import { NavigationLink } from '../consumer/NavigationLink';
import { localizedPath } from '../consumer/routes';
import type { ClientSettings } from '../lib/settings';
import { networkName, USDC_DECIMALS, usdcBalance } from './account';
import type { Session } from './session';

/** USDC per network, read from each network (`null` where it could not be read). */
async function readBalances(settings: ClientSettings, session: Session) {
  const results = await Promise.allSettled(
    settings.networks.map((id) => usdcBalance(session.wallet.address, id)),
  );
  return Object.fromEntries(
    settings.networks.map((id, i) => {
      const result = results[i];
      return [id, result.status === 'fulfilled' ? result.value : null];
    }),
  );
}

export function useBalances(settings: ClientSettings, session: Session) {
  const [balances, setBalances] = useState<Record<string, bigint | null>>({});
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    void readBalances(settings, session).then((value) => {
      if (active) setBalances(value);
    });
    return () => {
      active = false;
    };
  }, [settings, session, revision]);
  return { balances, refresh: () => setRevision((value) => value + 1) };
}

export const formatUsdc = (amount: bigint) =>
  Number(formatUnits(amount, USDC_DECIMALS)).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });

export function Home({
  settings,
  session,
  english: en,
}: {
  settings: ClientSettings;
  session: Session;
  english: boolean;
}) {
  const { balances, refresh } = useBalances(settings, session);
  const [hidden, setHidden] = useState(false);
  const loaded = Object.keys(balances).length > 0;
  const total = Object.values(balances).reduce<bigint>((sum, value) => sum + (value ?? 0n), 0n);
  const failed = Object.values(balances).some((value) => value === null);
  const actions = [
    { href: '/receive', label: en ? 'Receive' : 'Recibir', icon: ReceiveIcon },
    { href: '/send', label: en ? 'Send' : 'Enviar', icon: SendIcon },
    { href: '/scan', label: en ? 'Scan' : 'Escanear', icon: ScanIcon },
  ];
  return (
    <>
      <h1 className="sr-only">{en ? 'My GatoPago account' : 'Mi cuenta GatoPago'}</h1>
      <section className="meli-balance-card-app my-5 p-5" aria-label={en ? 'Balance' : 'Saldo'}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
            {en ? 'Balance' : 'Saldo'}
          </h2>
          <button
            type="button"
            onClick={() => setHidden((value) => !value)}
            aria-pressed={hidden}
            aria-label={
              hidden
                ? en
                  ? 'Show balance'
                  : 'Mostrar saldo'
                : en
                  ? 'Hide balance'
                  : 'Ocultar saldo'
            }
            className="flex h-11 w-11 shrink-0 items-center justify-center text-text-muted"
          >
            <EyeIcon hidden={hidden} />
          </button>
        </div>
        <p className="type-mono break-all text-[42px] font-bold leading-none tracking-[-0.06em] min-[390px]:text-[46px]">
          {hidden ? '••••' : loaded ? `$${formatUsdc(total)}` : '—'}
        </p>
        <p className="mt-2 text-[11px] text-text-faint">USDC</p>
        {loaded ? (
          <details className="mt-4 text-[12px] text-text-muted">
            <summary className="cursor-pointer py-2">{en ? 'By network' : 'Por red'}</summary>
            <ul>
              {settings.networks.map((id) => (
                <li key={id} className="flex justify-between py-1">
                  <span>{networkName(id)}</span>
                  <span className="font-mono">
                    {hidden ? '••••' : balances[id] === null ? '—' : formatUsdc(balances[id] ?? 0n)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {failed ? (
          <p className="mt-4 text-[12px] text-text-muted">
            {en
              ? 'Some networks could not be read. This does not mean that balance is zero.'
              : 'No pudimos leer algunas redes. Esto no significa que ese saldo sea cero.'}{' '}
            <button type="button" className="underline" onClick={refresh}>
              {en ? 'Retry' : 'Reintentar'}
            </button>
          </p>
        ) : null}
      </section>
      <div className="meli-quick-grid my-6">
        {actions.map((item) => (
          <NavigationLink
            key={item.href}
            href={localizedPath(item.href, en)}
            className="meli-quick-action interactive-surface"
          >
            <span>
              <item.icon />
            </span>
            <span>{item.label}</span>
          </NavigationLink>
        ))}
      </div>
    </>
  );
}
