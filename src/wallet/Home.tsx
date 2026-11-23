'use client';

import { walletAssets } from '@gatopago/shared/assets';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { walletNetwork } from '@gatopago/shared/networks';
import { EyeIcon, ReceiveIcon, SendIcon, SwapIcon } from '../consumer/Icons';
import { RecentActivity } from '../consumer/ActivityScreen';
import { ElsewhereNote } from '../consumer/ElsewhereNote';
import { MeliSprite } from '../marketing/MeliSprite';
import { balanceHidden, rememberBalanceHidden } from '../consumer/PaymentSheets';
import { TokenSelect } from '../consumer/TokenSelect';
import { Skeleton } from '../consumer/Skeleton';
import { NavigationLink } from '../consumer/NavigationLink';
import type { ClientSettings } from '../lib/settings';
import { formatBalance, formatHolding, useBalances, useLiveBalances } from './balances';
import type { Session } from './session';
import { useTranslations, useLocale } from 'next-intl';
import { SwapText } from '../consumer/SwapText';

const CardInterestSheet = dynamic(() =>
  import('../consumer/CardInterestSheet').then((m) => m.CardInterestSheet),
);

export function Home({ settings, session }: { settings: ClientSettings; session: Session }) {
  const locale = useLocale();
  const t = useTranslations('Home');
  const { saved, holding, refresh } = useBalances(settings, session);
  useLiveBalances(settings, session);
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
  const growingText = hidden ? '••••' : growing === null ? '—' : formatBalance(growing, locale);
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
  // GatoPago Card's waiting list opens from the menu (`/app?card`), not from a banner: the address
  // says whether it is open, so the menu opens it on this screen too.
  const cardOpen = useSearchParams().has('card');
  const { item: asset, held } =
    coins.find(({ item, held }) => `${held.networkId}/${item.symbol}` === currency) ?? coins[0];
  const native = asset.symbol !== 'USDC';
  const shownBalance = holding(held);
  const format = (item: (typeof assets)[number], value: bigint | null | undefined) => {
    if (hidden) return '••••';
    if (typeof value !== 'bigint') return '—';
    return item.symbol === 'USDC'
      ? formatBalance(value, locale)
      : formatHolding(value, item.decimals, locale);
  };
  // USDC, then only the coins the account holds: GatoPago pays the network fee, so a gas coin or a
  // test token with nothing in it is not worth a row. Each coin says its name, never its network.
  const tokens = coins
    .filter(({ item, held }) => {
      const value = holding(held);
      return item.symbol === 'USDC' || (typeof value === 'bigint' && value > 0n);
    })
    .map(({ item, held }) => ({
      value: `${held.networkId}/${item.symbol}`,
      symbol: item.symbol,
      label: item.name,
      balance: format(item, holding(held)),
    }))
    .sort((a, b) => Number(a.symbol !== 'USDC') - Number(b.symbol !== 'USDC'));
  const actions = [
    { href: '/send', label: t('send'), icon: SendIcon },
    { href: '/receive', label: t('receive'), icon: ReceiveIcon },
    { href: '/swap', label: t('swap'), icon: SwapIcon },
  ];
  return (
    <>
      <h1 className="sr-only">{t('myGatopagoAccount')}</h1>
      <section className="meli-balance-card-app p-5" aria-labelledby="available-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2
            id="available-heading"
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-text-muted"
          >
            {t('available')}
          </h2>
          <div className="flex shrink-0 items-center gap-1">
            <TokenSelect value={currency} options={tokens} onChange={setCurrency} />
            <button
              type="button"
              onClick={() => {
                rememberBalanceHidden(!hidden);
                setHidden(!hidden);
              }}
              aria-pressed={hidden}
              aria-label={hidden ? t('showBalance') : t('hideBalance')}
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
            {!hidden && !native && shownBalance != null ? (
              <span className="mr-1 text-[0.5em]">$</span>
            ) : null}
            {/* The same text in both places, so a new balance (a payment arrived), hiding it or
                showing it rises into place instead of jumping. */}
            {hidden ? (
              <SwapText>••••</SwapText>
            ) : shownBalance != null ? (
              <SwapText>
                {native
                  ? formatHolding(shownBalance, asset.decimals, locale)
                  : formatBalance(shownBalance, locale)}
              </SwapText>
            ) : (
              '—'
            )}
          </p>
        )}
        {/* Only a coin that is not your dollar balance needs a word, and a test token says it is
            worth nothing. The balance refreshes on its own and with a pull, so no button. */}
        {native ? (
          <p className="mt-3 truncate text-[12px] text-text-faint">
            {asset.test
              ? t('testToken')
              : held.token !== null
                ? t('keptApartUsdc')
                : t('notCountedDollarBalance')}
          </p>
        ) : null}
        {growing ? (
          <NavigationLink
            href={'/earn'}
            className="mt-4 flex items-center justify-between gap-3 border-t border-[rgb(255_248_240/.14)] pt-3 text-[12px]"
          >
            <span className="flex items-center gap-2 text-text-muted">
              <i className="h-2 w-2 bg-[#71d5a1]" aria-hidden="true" />
              {t('alsoGrowing')}
            </span>
            <strong className="font-mono">{growingText} USDC</strong>
          </NavigationLink>
        ) : null}
        {shownBalance === null ? (
          <p className="mt-4 text-[12px] text-text-muted">
            {t('couldNotReadBalance')}{' '}
            <button type="button" className="underline" onClick={refresh}>
              {t('retry')}
            </button>
          </p>
        ) : null}
      </section>
      {native ? null : (
        <ElsewhereNote settings={settings} session={session} className="mt-3 px-1" />
      )}
      <div className="meli-quick-grid mt-5">
        {actions.map((item) => (
          <NavigationLink
            key={item.href}
            href={item.href}
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
            {t('recentActivity')}
          </h2>
          <NavigationLink
            href={'/statement'}
            className="btn-text min-h-11 text-[13px] text-cat-700"
          >
            {t('seeAll')}
          </NavigationLink>
        </div>
        <RecentActivity settings={settings} session={session} hidden={hidden} />
      </section>
      {growing ? null : (
        <NavigationLink
          href={'/earn'}
          className="meli-paper-card meli-paper-card--strong interactive-surface relative mt-6 grid grid-cols-[1fr_76px] items-center gap-3 overflow-hidden p-4 text-left"
        >
          <span>
            <span className="meli-kicker mb-2 block">{t('grow')}</span>
            <strong className="block font-display text-[18px] leading-tight">
              {t('putMoneyNotUsing')}
            </strong>
            <span className="mt-1.5 block text-[12px] leading-snug text-text-muted">
              {t('variableRateAaveWithdraw')}
            </span>
          </span>
          <MeliSprite variant="body-sleeping" className="w-20 translate-y-2" />
        </NavigationLink>
      )}
      {cardOpen ? (
        <CardInterestSheet
          settings={settings}
          session={session}
          // Next follows this change: `?card` leaves the address and the sheet closes.
          onClose={() =>
            window.history.replaceState(window.history.state, '', window.location.pathname)
          }
        />
      ) : null}
    </>
  );
}
