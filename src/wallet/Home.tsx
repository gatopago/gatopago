'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { formatUnits } from 'viem';
import { walletNetwork } from '@gatopago/shared/networks';
import { EyeIcon, RefreshIcon, RequestIcon, ScanIcon, SendIcon, SwapIcon } from '../consumer/Icons';
import { RecentActivity } from '../consumer/ActivityScreen';
import { MeliSprite } from '../marketing/MeliSprite';
import { balanceHidden, rememberBalanceHidden } from '../consumer/PaymentSheets';
import { TokenSelect } from '../consumer/TokenSelect';
import { assetBalance, walletAssets } from '@gatopago/shared/assets';
import { useAdvanced } from './preferences';
import { Skeleton } from '../consumer/Skeleton';
import { NavigationLink } from '../consumer/NavigationLink';
import { localizedPath } from '../consumer/routes';
import type { ClientSettings } from '../lib/settings';
import { networkName } from './account';
import { formatBalance, plus, totalUsdc, useBalances } from './balances';
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
  const { balances, natives, saved, holding, stellar, stellarUsdc, refreshing, refresh } =
    useBalances(settings, session);
  const stellarId = stellar ? settings.stellar!.network : null;
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
  const advanced = useAdvanced();
  const assets = walletAssets(settings.networks);
  const [currency, setCurrency] = useState('all/USDC');
  const [cardOpen, setCardOpen] = useState(false),
    [cardSaved, setCardSaved] = useState(false);
  // `all/<coin>` is a coin across networks; `<network>/<coin>` exists only in the advanced view.
  const [selectedNetwork, symbol] = (advanced ? currency : currency.replace(/^[^/]+/, 'all')).split(
    '/',
  );
  const native = symbol !== 'USDC';
  const asset = assets.find((item) => item.symbol === symbol) ?? assets[0];
  const loaded =
    settings.networks.every((id) => balances[id] !== undefined) && stellarUsdc !== undefined;
  // USDC on Stellar counts with the rest; other coins live only on EVM networks.
  const coinBalance = (item: (typeof assets)[number]) =>
    item.symbol === 'USDC'
      ? plus(assetBalance(item, holding), stellarUsdc)
      : assetBalance(item, holding);
  const total = plus(totalUsdc(balances, settings.networks), stellarUsdc);
  const failed = Object.values(balances).some((value) => value === null) || stellarUsdc === null;
  const shownBalance =
    selectedNetwork === 'all'
      ? coinBalance(asset)
      : selectedNetwork === stellarId
        ? stellarUsdc
        : (() => {
            const held = asset.holdings.find(({ networkId }) => networkId === selectedNetwork);
            return held ? holding(held) : null;
          })();
  const format = (item: (typeof assets)[number], value: bigint | null | undefined) => {
    if (hidden) return '••••';
    if (typeof value !== 'bigint') return '—';
    return item.symbol === 'USDC'
      ? formatBalance(value, en)
      : Number(formatUnits(value, item.decimals)).toLocaleString(en ? 'en' : 'es', {
          maximumFractionDigits: 6,
        });
  };
  // USDC always; other coins only when there is some, or while chosen (no empty test tokens).
  const shows = (item: (typeof assets)[number], value: bigint | null | undefined) =>
    item.symbol === 'USDC' || item.symbol === symbol || (typeof value === 'bigint' && value > 0n);
  // Simple view: each coin once. Advanced view: USDC in total, then every coin on each network.
  const tokens = [
    ...(advanced
      ? [
          {
            value: 'all/USDC',
            symbol: 'USDC',
            label: en ? 'All networks' : 'Todas las redes',
            balance: format(assets[0], total),
          },
        ]
      : assets
          .filter((item) => shows(item, coinBalance(item)))
          .map((item) => ({
            value: `all/${item.symbol}`,
            symbol: item.symbol,
            label: item.name,
            balance: format(item, coinBalance(item)),
          }))),
    ...(advanced
      ? assets.flatMap((item) =>
          item.holdings
            .filter((held) => shows(item, holding(held)))
            .map((held) => ({
              value: `${held.networkId}/${item.symbol}`,
              symbol: item.symbol,
              label: networkName(held.networkId),
              balance: format(item, holding(held)),
            })),
        )
      : []),
    ...(advanced && stellarId
      ? [
          {
            value: `${stellarId}/USDC`,
            symbol: 'USDC',
            label: networkName(stellarId),
            balance: format(assets[0], stellarUsdc),
          },
        ]
      : []),
  ];
  const actions = [
    { href: '/charge', label: en ? 'Request' : 'Cobrar', icon: RequestIcon },
    { href: '/send', label: en ? 'Send' : 'Enviar', icon: SendIcon },
    { href: '/swap', label: en ? 'Swap' : 'Cambiar', icon: SwapIcon },
    { href: '/scan', label: en ? 'Scan' : 'Escanear', icon: ScanIcon },
  ];
  const elsewhere = [
    ...settings.networks.filter((id) => id !== settings.homeNetwork && (balances[id] ?? 0n) > 0n),
    ...(stellarId && (stellarUsdc ?? 0n) > 0n ? [stellarId] : []),
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
                Number(formatUnits(shownBalance, asset.decimals)).toLocaleString(en ? 'en' : 'es', {
                  maximumFractionDigits: 6,
                })
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
          <span className="min-w-0 truncate">
            {!advanced
              ? native
                ? `${asset.name} · ${
                    asset.holdings.some(({ token }) => token !== null)
                      ? en
                        ? 'kept apart from your USDC'
                        : 'aparte de tus USDC'
                      : en
                        ? 'not counted in dollars'
                        : 'no se suma en dólares'
                  }`
                : en
                  ? 'Digital dollars (USDC)'
                  : 'Dólares digitales (USDC)'
              : selectedNetwork === 'all'
                ? en
                  ? 'Across all your networks'
                  : 'En todas tus redes'
                : `${en ? 'On' : 'En'} ${networkName(selectedNetwork)}`}
            {advanced && native
              ? en
                ? ' · not counted in dollars'
                : ' · no se suma en dólares'
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
                  ? 'Updating'
                  : 'Actualizando'
                : en
                  ? 'Update'
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
        {(native ? natives[selectedNetwork] === null : failed) ? (
          <p className="mt-4 text-[12px] text-text-muted">
            {en
              ? 'We could not read every network, so part of your balance may be missing. Your money is safe.'
              : 'No pudimos leer todas las redes y puede faltar parte de tu saldo. Tu dinero está a salvo.'}{' '}
            <button type="button" className="underline" onClick={refresh}>
              {en ? 'Retry' : 'Reintentar'}
            </button>
          </p>
        ) : null}
      </section>
      {advanced && !native && elsewhere.length > 0 ? (
        <NavigationLink
          href={localizedPath('/crosschain', en)}
          className="interactive-surface mt-4 flex items-center gap-3 border border-pending bg-pending/8 px-4 py-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <strong className="block text-[13px] text-pending">
              {en ? 'Bring your balance together' : 'Junta tu saldo en un solo lugar'}
            </strong>
            <small className="mt-0.5 block text-[12px] leading-snug text-text-muted">
              {en
                ? `You have USDC on ${elsewhere.map(networkName).join(', ')}. Move it to ${networkName(settings.homeNetwork)} to use it all.`
                : `Tienes USDC en ${elsewhere.map(networkName).join(', ')}. Pásalo a ${networkName(settings.homeNetwork)} para usarlo todo.`}
            </small>
          </span>
          <span aria-hidden="true" className="font-mono text-pending">
            →
          </span>
        </NavigationLink>
      ) : null}
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
