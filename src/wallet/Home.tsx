'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { formatUnits } from 'viem';
import { walletNetwork } from '@gatopago/shared/networks';
import { EyeIcon, MoveIcon, RequestIcon, ScanIcon, SendIcon, SwapIcon } from '../consumer/Icons';
import { RecentActivity } from '../consumer/ActivityScreen';
import { MeliSprite } from '../marketing/MeliSprite';
import { balanceHidden, rememberBalanceHidden } from '../consumer/PaymentSheets';
import { TokenSelect } from '../consumer/TokenSelect';
import { Skeleton } from '../consumer/Skeleton';
import { NavigationLink } from '../consumer/NavigationLink';
import { localizedPath } from '../consumer/routes';
import type { ClientSettings } from '../lib/settings';
import { networkName } from './account';
import { formatUsdc, useBalances } from './balances';
import type { Session } from './session';

const CardInterestSheet = dynamic(() =>
  import('../consumer/CardInterestSheet').then((m) => m.CardInterestSheet),
);

export function Home({
  settings,
  session,
  english: en,
}: {
  settings: ClientSettings;
  session: Session;
  english: boolean;
}) {
  const { balances, natives, saved, refreshing, refresh } = useBalances(settings, session);
  const [hidden, setHidden] = useState(balanceHidden);
  const savedValues = Object.values(saved);
  // What grows in Aave, across the networks with a market; `null` until read.
  const growing =
    savedValues.length > 0 && savedValues.every((value) => typeof value === 'bigint')
      ? savedValues.reduce<bigint>((sum, value) => sum + (value ?? 0n), 0n)
      : null;
  const growingText = hidden ? '••••' : growing === null ? '—' : formatUsdc(growing);
  const [currency, setCurrency] = useState('all/USDC');
  const [cardOpen, setCardOpen] = useState(false),
    [cardSaved, setCardSaved] = useState(false);
  const [selectedNetwork, symbol] = currency.split('/');
  const native = symbol !== 'USDC';
  const loaded = Object.keys(balances).length > 0;
  const total = Object.values(balances).reduce<bigint>((sum, value) => sum + (value ?? 0n), 0n);
  const failed = Object.values(balances).some((value) => value === null);
  const shownBalance = native
    ? natives[selectedNetwork]
    : !loaded
      ? undefined
      : selectedNetwork === 'all'
        ? failed
          ? null
          : total
        : balances[selectedNetwork];
  const tokens = [
    {
      value: 'all/USDC',
      symbol: 'USDC',
      label: en ? 'All networks' : 'Todas las redes',
      balance: hidden ? '••••' : loaded && !failed ? formatUsdc(total) : '—',
    },
    ...settings.networks.flatMap((id) => [
      {
        value: `${id}/USDC`,
        symbol: 'USDC',
        label: networkName(id),
        balance: hidden
          ? '••••'
          : typeof balances[id] === 'bigint'
            ? formatUsdc(balances[id])
            : '—',
      },
      {
        value: `${id}/${walletNetwork(id).chain.nativeCurrency.symbol}`,
        symbol: walletNetwork(id).chain.nativeCurrency.symbol,
        label: networkName(id),
      },
    ]),
  ];
  const actions = [
    { href: '/charge', label: en ? 'Request' : 'Cobrar', icon: RequestIcon },
    { href: '/send', label: en ? 'Send' : 'Enviar', icon: SendIcon },
    { href: '/swap', label: en ? 'Swap' : 'Cambiar', icon: SwapIcon },
    { href: '/scan', label: en ? 'Scan' : 'Escanear', icon: ScanIcon },
  ];
  const elsewhere = settings.networks.filter(
    (id) => id !== settings.homeNetwork && (balances[id] ?? 0n) > 0n,
  );
  return (
    <>
      <h1 className="sr-only">{en ? 'My GatoPago account' : 'Mi cuenta GatoPago'}</h1>
      <section className="meli-balance-card-app p-5" aria-labelledby="available-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2
            id="available-heading"
            className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted"
          >
            {en ? 'Available' : 'Disponible'}
          </h2>
          <div className="flex shrink-0 items-center gap-1">
            <TokenSelect value={currency} options={tokens} onChange={setCurrency} english={en} />
            <button
              type="button"
              onClick={() => {
                rememberBalanceHidden(!hidden);
                setHidden(!hidden);
              }}
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
              className="flex h-10 w-10 shrink-0 items-center justify-center text-text-faint"
            >
              <EyeIcon hidden={hidden} />
            </button>
          </div>
        </div>
        {shownBalance === undefined && !hidden ? (
          <Skeleton className="h-11 w-44" />
        ) : (
          <p className="type-mono break-all text-[42px] font-bold leading-none tracking-[-0.06em] min-[390px]:text-[46px]">
            {hidden ? (
              '••••'
            ) : shownBalance != null ? (
              native ? (
                Number(
                  formatUnits(
                    shownBalance,
                    walletNetwork(selectedNetwork).chain.nativeCurrency.decimals,
                  ),
                ).toLocaleString(en ? 'en' : 'es', { maximumFractionDigits: 6 })
              ) : (
                <>
                  <span className="mr-1 text-[23px]">$</span>
                  {formatUsdc(shownBalance)}
                </>
              )
            ) : (
              '—'
            )}
          </p>
        )}
        <p className="mt-2 text-[11px] text-text-faint">
          {symbol} ·{' '}
          {selectedNetwork === 'all'
            ? en
              ? 'All networks'
              : 'Todas las redes'
            : networkName(selectedNetwork)}{' '}
          ·{' '}
          {native
            ? en
              ? 'Available balance · no USD valuation'
              : 'Saldo disponible · sin valoración en USD'
            : en
              ? 'Ready to send, withdraw, or use'
              : 'Listo para enviar, retirar o usar'}
        </p>
        <div className="meli-growth-rail mt-6" aria-hidden="true">
          <span style={{ width: growing ? '33%' : '6%' }} />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-[11px]">
          <span className="flex items-center gap-2 text-text-muted">
            <i className="h-2 w-2 bg-growth" aria-hidden="true" />
            {en ? 'Growing' : 'Creciendo'}
          </span>
          <strong className="font-mono text-[11px]">{growingText} USDC</strong>
        </div>
        {(native ? natives[selectedNetwork] === null : failed) ? (
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
      {!native && elsewhere.length > 0 ? (
        <NavigationLink
          href={localizedPath('/crosschain', en)}
          className="mt-4 block border-2 border-pending bg-pending/10 p-4 text-left"
        >
          <strong className="font-display text-[14px] text-pending">
            {en
              ? `Move your balance to ${networkName(settings.homeNetwork)}`
              : `Junta tu saldo en ${networkName(settings.homeNetwork)}`}
          </strong>
          <small className="mt-1 block text-[11px] leading-relaxed text-text-muted">
            {en
              ? `You have USDC on ${elsewhere.map(networkName).join(', ')}. Bring it to your main network to use it all at once.`
              : `Tienes USDC en ${elsewhere.map(networkName).join(', ')}. Tráelo a tu red principal para usarlo todo junto.`}
          </small>
        </NavigationLink>
      ) : null}
      <div className="meli-quick-grid mt-6">
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
      <NavigationLink
        href={localizedPath('/move', en)}
        className="meli-path-card-app interactive-surface mt-5 min-h-[88px] p-4 text-left"
      >
        <span aria-hidden="true">
          <MoveIcon />
        </span>
        <span className="min-w-0">
          <strong className="block font-display text-[17px]">
            {en ? 'Move money' : 'Mover dinero'}
          </strong>
          <small className="mt-1 block text-[11px] leading-relaxed text-text-muted">
            {en ? 'Receive, send, withdraw, or swap' : 'Recibir, enviar, retirar o cambiar'}
          </small>
        </span>
        <span aria-hidden="true" className="font-mono text-[18px] font-bold">
          →
        </span>
      </NavigationLink>
      <div className="mt-4 flex items-center justify-center gap-2 font-mono text-[9px] uppercase tracking-[0.08em] text-text-faint">
        <span>
          {!loaded
            ? en
              ? 'Reading balance…'
              : 'Leyendo saldo…'
            : failed
              ? en
                ? 'Balance temporarily unavailable'
                : 'Saldo temporalmente no disponible'
              : en
                ? 'Balance updated'
                : 'Saldo actualizado'}
        </span>
        <span aria-hidden="true">·</span>
        <button
          type="button"
          disabled={refreshing}
          onClick={refresh}
          className="min-h-11 underline decoration-current underline-offset-2 disabled:cursor-wait disabled:opacity-60"
        >
          {refreshing && loaded
            ? en
              ? 'Refreshing…'
              : 'Actualizando…'
            : en
              ? 'Refresh'
              : 'Actualizar'}
        </button>
      </div>
      <NavigationLink
        href={localizedPath('/earn', en)}
        className="meli-paper-card meli-paper-card--strong interactive-surface relative mt-7 grid min-h-[150px] grid-cols-[1fr_88px] items-center gap-3 overflow-hidden p-5 text-left"
      >
        <span>
          <span className="meli-kicker mb-3 block">{en ? 'Growing' : 'Creciendo'}</span>
          <strong className="tabular block font-display text-[27px] leading-none font-normal">
            {growingText} USDC
          </strong>
          <span className="mt-3 block text-[12px] leading-relaxed text-text-muted">
            {growing
              ? en
                ? 'Your digital dollars are earning.'
                : 'Tus dólares están generando rendimiento.'
              : en
                ? 'Put the digital dollars you do not need now to work.'
                : 'Pon a trabajar los dólares que no necesitas ahora.'}
          </span>
          <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.06em] text-text-faint">
            Aave V3 · {en ? 'Variable rate' : 'Tasa variable'}
          </span>
        </span>
        <MeliSprite variant="body-sleeping" className="w-24 translate-y-3" />
      </NavigationLink>
      <button
        type="button"
        onClick={() => setCardOpen(true)}
        className="meli-ink-card interactive-surface relative mt-6 min-h-[190px] w-full overflow-hidden p-5 text-left"
      >
        <span className="meli-kicker mb-3 block !text-cat-500">GatoPago Card</span>
        <strong className="block max-w-[260px] font-display text-[22px] font-normal">
          {en
            ? 'Your digital dollars, ready for everyday life.'
            : 'Tus dólares digitales, listos para el mundo cotidiano.'}
        </strong>
        <span className="mt-3 block max-w-[245px] text-[12px] leading-relaxed text-[rgb(255_248_240/.64)]">
          {en
            ? 'Tell us how you would use a future GatoPago Card. This is an early-access survey, not a card application.'
            : 'Cuéntanos cómo usarías una futura GatoPago Card. Es una encuesta de acceso anticipado, no una solicitud de tarjeta.'}
        </span>
        <span className="mt-5 inline-flex border border-[rgb(255_248_240/.28)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.06em] text-[#fff8f0]">
          {cardSaved
            ? en
              ? 'Update my interest'
              : 'Actualizar mi interés'
            : en
              ? 'I want early access'
              : 'Quiero acceso anticipado'}{' '}
          →
        </span>
        <MeliSprite
          variant="body-peek-card"
          className="pointer-events-none absolute -right-8 -bottom-5 w-36"
        />
      </button>
      {cardOpen ? (
        <CardInterestSheet
          settings={settings}
          session={session}
          english={en}
          onClose={() => setCardOpen(false)}
          onSaved={() => setCardSaved(true)}
        />
      ) : null}
      <section className="meli-paper-card mt-7" aria-labelledby="recent-activity-title">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 id="recent-activity-title" className="font-display text-[18px]">
            {en ? 'Recent activity' : 'Actividad reciente'}
          </h2>
        </div>
        <RecentActivity settings={settings} session={session} hidden={hidden} english={en} />
      </section>
      <NavigationLink
        href={localizedPath('/statement', en)}
        className="btn btn-ghost btn-block mt-4"
      >
        {en ? 'View all activity' : 'Ver toda la actividad'}
      </NavigationLink>
    </>
  );
}
