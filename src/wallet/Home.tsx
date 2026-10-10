'use client';

import { walletAssets } from '@gatopago/shared/assets';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { walletNetwork } from '@gatopago/shared/networks';
import { EyeIcon, RefreshIcon, RequestIcon, ScanIcon, SendIcon, SwapIcon } from '../consumer/Icons';
import { RecentActivity } from '../consumer/ActivityScreen';
import { ElsewhereNote } from '../consumer/ElsewhereNote';
import { MeliSprite } from '../marketing/MeliSprite';
import { balanceHidden, rememberBalanceHidden } from '../consumer/PaymentSheets';
import { TokenSelect } from '../consumer/TokenSelect';
import { Skeleton } from '../consumer/Skeleton';
import { NavigationLink } from '../consumer/NavigationLink';
import { localizedPath } from '../consumer/routes';
import type { ClientSettings } from '../lib/settings';
import { networkName } from './account';
import { formatBalance, formatHolding, useBalances } from './balances';
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
  const { balances, saved, holding, refreshing, refresh } = useBalances(settings, session);
  const home = settings.homeNetwork;
  const [hidden, setHidden] = useState(balanceHidden);
  const savedValues = settings.networks
    .filter((id) => walletNetwork(id).aave)
    .map((id) => saved[id]);
  // What grows in Aave, across the networks with a market; `null` until read.
  const growing =
    savedValues.length > 0 && savedValues.every((value) => typeof value === 'bigint')
      ? savedValues.reduce<bigint>((sum, value) => sum + (value ?? 0n), 0n)
      : null;
  const growingText = hidden ? '••••' : growing === null ? '—' : formatBalance(growing, en);
  // XLM joins the list when Stellar is on, on its own network like every other coin.
  const assets = walletAssets(settings.networks, settings.stellar?.network);
  // USDC is one balance, on the home network. Every other coin is listed on its own network (ETH on
  // Arbitrum, AVAX on Avalanche…): it cannot cross networks the way USDC does.
  const coins = assets.flatMap((item) =>
    item.symbol === 'USDC'
      ? [{ item, held: item.holdings.find(({ networkId }) => networkId === home)! }]
      : item.holdings.map((held) => ({ item, held })),
  );
  const [currency, setCurrency] = useState(`${home}/USDC`);
  const [cardOpen, setCardOpen] = useState(false);
  const [cardSaved, setCardSaved] = useState(false);
  const { item: asset, held } =
    coins.find(({ item, held }) => `${held.networkId}/${item.symbol}` === currency) ?? coins[0];
  const native = asset.symbol !== 'USDC';
  const shownBalance = holding(held);
  const loaded = balances[home] !== undefined;
  const format = (item: (typeof assets)[number], value: bigint | null | undefined) => {
    if (hidden) return '••••';
    if (typeof value !== 'bigint') return '—';
    return item.symbol === 'USDC'
      ? formatBalance(value, en)
      : formatHolding(value, item.decimals, en);
  };
  // USDC first, then the coins the account holds, then the empty ones, quieter.
  const tokens = coins
    .map(({ item, held }) => ({
      value: `${held.networkId}/${item.symbol}`,
      symbol: item.symbol,
      label: networkName(held.networkId),
      balance: format(item, holding(held)),
      muted: holding(held) === 0n,
    }))
    .sort(
      (a, b) =>
        Number(a.symbol !== 'USDC') - Number(b.symbol !== 'USDC') ||
        Number(a.muted) - Number(b.muted),
    );
  const actions = [
    { href: '/charge', label: en ? 'Request' : 'Cobrar', icon: RequestIcon },
    { href: '/send', label: en ? 'Send' : 'Enviar', icon: SendIcon },
    { href: '/swap', label: en ? 'Swap' : 'Cambiar', icon: SwapIcon },
    { href: '/scan', label: en ? 'Scan' : 'Escanear', icon: ScanIcon },
  ];
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
          <p className="balance-amount type-mono break-all font-bold leading-none tracking-[-0.06em]">
            {hidden ? (
              '••••'
            ) : shownBalance != null ? (
              native ? (
                formatHolding(shownBalance, asset.decimals, en)
              ) : (
                <>
                  <span className="mr-1 text-[0.5em]">$</span>
                  {formatBalance(shownBalance, en)}
                </>
              )
            ) : (
              '—'
            )}
          </p>
        )}
        <div className="mt-3 flex items-center justify-between gap-3 text-[12px] text-text-faint">
          {/* The selector already says the coin and its network. Only a coin that is not your dollar
              balance needs a word. */}
          <span className="min-w-0 truncate">
            {native
              ? held.token !== null
                ? en
                  ? 'Kept apart from your USDC'
                  : 'Aparte de tus USDC'
                : en
                  ? 'Not counted in your dollar balance'
                  : 'No se suma a tu saldo en dólares'
              : null}
          </span>
          <button
            type="button"
            disabled={refreshing}
            onClick={refresh}
            aria-label={en ? 'Refresh balance' : 'Actualizar saldo'}
            className="balance-refresh -mr-2 flex h-9 shrink-0 items-center gap-1.5 px-2 disabled:cursor-wait"
            data-busy={refreshing || !loaded}
          >
            <RefreshIcon />
            <span>
              {!loaded || refreshing
                ? en
                  ? 'Refreshing'
                  : 'Actualizando'
                : en
                  ? 'Refresh'
                  : 'Actualizar'}
            </span>
          </button>
        </div>
        {growing ? (
          <NavigationLink
            href={localizedPath('/earn', en)}
            className="mt-4 flex items-center justify-between gap-3 border-t border-[rgb(255_248_240/.14)] pt-3 text-[12px]"
          >
            <span className="flex items-center gap-2 text-text-muted">
              <i className="h-2 w-2 bg-[#71d5a1]" aria-hidden="true" />
              {en ? 'Also growing' : 'Además, creciendo'}
            </span>
            <strong className="font-mono">{growingText} USDC</strong>
          </NavigationLink>
        ) : null}
        {shownBalance === null ? (
          <p className="mt-4 text-[12px] text-text-muted">
            {en
              ? 'We could not read this balance right now. Your money is safe.'
              : 'No pudimos leer este saldo ahora. Tu dinero está a salvo.'}{' '}
            <button type="button" className="underline" onClick={refresh}>
              {en ? 'Retry' : 'Reintentar'}
            </button>
          </p>
        ) : null}
      </section>
      {native ? null : (
        <ElsewhereNote settings={settings} session={session} english={en} className="mt-3 px-1" />
      )}
      <div className="meli-quick-grid mt-5">
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
      <section className="meli-paper-card mt-6" aria-labelledby="recent-activity-title">
        <div className="flex items-center justify-between gap-3 border-b border-border py-1 pr-1 pl-4">
          <h2 id="recent-activity-title" className="font-display text-[17px]">
            {en ? 'Recent activity' : 'Actividad reciente'}
          </h2>
          <NavigationLink
            href={localizedPath('/statement', en)}
            className="btn-text min-h-11 text-[13px] text-cat-700"
          >
            {en ? 'See all' : 'Ver todo'}
          </NavigationLink>
        </div>
        <RecentActivity settings={settings} session={session} hidden={hidden} english={en} />
      </section>
      {growing ? null : (
        <NavigationLink
          href={localizedPath('/earn', en)}
          className="meli-paper-card meli-paper-card--strong interactive-surface relative mt-6 grid grid-cols-[1fr_76px] items-center gap-3 overflow-hidden p-4 text-left"
        >
          <span>
            <span className="meli-kicker mb-2 block">{en ? 'Grow' : 'Crecer'}</span>
            <strong className="block font-display text-[18px] leading-tight">
              {en
                ? 'Put the money you are not using to work'
                : 'Pon a trabajar el dinero que no estás usando'}
            </strong>
            <span className="mt-1.5 block text-[12px] leading-snug text-text-muted">
              {en
                ? 'Variable rate with Aave. Withdraw whenever you want.'
                : 'Tasa variable con Aave. Retíralo cuando quieras.'}
            </span>
          </span>
          <MeliSprite variant="body-sleeping" className="w-20 translate-y-2" />
        </NavigationLink>
      )}
      <button
        type="button"
        onClick={() => setCardOpen(true)}
        className="meli-ink-card interactive-surface relative mt-6 w-full overflow-hidden p-4 pr-28 text-left"
      >
        <span className="meli-kicker mb-2 block !text-cat-500">GatoPago Card</span>
        <strong className="block font-display text-[18px] leading-tight font-normal">
          {en ? 'Pay with your balance anywhere' : 'Paga con tu saldo en cualquier lugar'}
        </strong>
        <span className="mt-1.5 block text-[12px] leading-snug text-[rgb(255_248_240/.64)]">
          {cardSaved
            ? en
              ? 'Thanks! You are on the list. Tap to change your answers.'
              : '¡Gracias! Ya estás en la lista. Toca para cambiar tus respuestas.'
            : en
              ? 'We are designing it. Tell us how you would use it.'
              : 'La estamos diseñando. Cuéntanos cómo la usarías.'}
        </span>
        <MeliSprite
          variant="body-peek-card"
          className="pointer-events-none absolute -right-6 -bottom-4 w-28"
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
    </>
  );
}
