'use client';

import { useEffect, useState } from 'react';
import { formatUnits } from 'viem';
import { exactUnits, tooPrecise } from '../lib/amount';
import { useFailureMessage } from '../wallet/messages';
import { walletNetwork } from '@gatopago/shared/networks';
import {
  minimumOut,
  quoteSwap,
  swapCalls,
  type SwapQuote,
  type SwapToken,
} from '@gatopago/shared/swap';
import type { ClientSettings } from '../lib/settings';
import { CatGlyph } from '../marketing/CatGlyph';
import { walletAssets } from '@gatopago/shared/assets';
import { explorerUrl, networkName, publicClient, USDC_DECIMALS } from '../wallet/account';
import { send } from '../wallet/operations';
import { formatAmount, formatBalance, formatHolding, useBalances } from '../wallet/balances';
import { useAction } from '../wallet/useAction';
import type { Session } from '../wallet/session';
import { ElsewhereNote } from './ElsewhereNote';
import { ConfirmDetails, ConfirmSheet, SigningDetails } from './PaymentSheets';
import { BackHeader, MoneyPanel, TransactionActions } from './Primitives';
import { AmountInput } from './SelectMenu';
import { TokenSelect } from './TokenSelect';
import { TxResult } from './TxResult';
import { useTranslations, useLocale } from 'next-intl';

/** Price tolerance applied to every quote (0.5 %). */
const SLIPPAGE_BPS = 50;
/** Typing pauses this long before a quote is requested. */
const QUOTE_DELAY_MS = 400;

/** `/swap`, V2's Swap: USDC and the native token, through Uniswap v3 on the home network. */
export function SwapScreen({ settings, session }: { settings: ClientSettings; session: Session }) {
  const messageFor = useFailureMessage();
  const locale = useLocale();
  const t = useTranslations('Swap');
  const networkId = settings.homeNetwork;
  const network = walletNetwork(networkId);
  const { balances, natives, refresh } = useBalances(settings, session);
  const [tokenIn, setTokenIn] = useState<SwapToken>('usdc');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  // Which request is being quoted, and which one failed: both belong to the amount and coin they
  // were asked for, so clearing or changing them never leaves an old spinner or error on screen.
  const [quotingFor, setQuotingFor] = useState<string | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  // One swap at a time: a second tap before the next render does not start another.
  const { busy, error, setError, run } = useAction();
  const [done, setDone] = useState<{ quote: SwapQuote; hash: `0x${string}` } | null>(null);

  const tokenOut: SwapToken = tokenIn === 'usdc' ? 'native' : 'usdc';
  const native = network.chain.nativeCurrency;
  const symbol = (token: SwapToken) => (token === 'usdc' ? 'USDC' : native.symbol);
  const decimals = (token: SwapToken) => (token === 'usdc' ? USDC_DECIMALS : native.decimals);
  const balanceIn = tokenIn === 'usdc' ? balances[networkId] : natives[networkId];
  const precision = tooPrecise(amount, decimals(tokenIn))
    ? messageFor(new Error('TOO_MANY_DECIMALS'))
    : '';
  const amountIn =
    !precision && /^(\d+\.?\d*|\.\d+)$/.test(amount) ? exactUnits(amount, decimals(tokenIn)) : 0n;
  const format = (value: bigint, token: SwapToken) =>
    token === 'usdc' ? formatBalance(value, locale) : formatHolding(value, decimals(token), locale);

  const request = `${tokenIn}:${amountIn}`;
  const quoting = amountIn > 0n && quotingFor === request;
  const quoteError =
    precision || (amountIn > 0n && failedFor === request ? t('couldntGetQuote') : '');
  useEffect(() => {
    if (!network.uniswap || amountIn <= 0n) return;
    const asked = `${tokenIn}:${amountIn}`;
    let active = true;
    const timer = setTimeout(() => {
      setQuotingFor(asked);
      setFailedFor(null);
      quoteSwap(publicClient(settings, networkId), network, { tokenIn, tokenOut, amountIn })
        .then((value) => {
          if (active) setQuote(value);
        })
        .catch(() => {
          if (active) setFailedFor(asked);
        })
        .finally(() => setQuotingFor((current) => (current === asked ? null : current)));
    }, QUOTE_DELAY_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [settings, networkId, network, tokenIn, tokenOut, amountIn]);

  const current = quote && quote.tokenIn === tokenIn && quote.amountIn === amountIn ? quote : null;
  const minimum = current ? minimumOut(current, SLIPPAGE_BPS) : 0n;
  const enough = typeof balanceIn === 'bigint' && amountIn <= balanceIn;

  if (!network.uniswap)
    return (
      <>
        <BackHeader title={t('swap')} to="/move" />
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <CatGlyph className="mb-5 w-12 opacity-40" decorative />
          <p className="mb-1 text-[15px]">{t('swapsNotAvailableYet')}</p>
          <p className="max-w-[260px] text-[13px] leading-relaxed text-text-muted">
            {t('werePreparingFeatureCheck', { networkId: networkName(networkId) })}
          </p>
        </div>
      </>
    );

  if (done)
    return (
      <>
        <BackHeader title={t('swap')} to="/move" />
        <TxResult
          state="success"
          lead={t('doneReceivedAbout')}
          amount={format(done.quote.amountOut, done.quote.tokenOut)}
          unit={symbol(done.quote.tokenOut)}
          body={t('alreadyBalance')}
        >
          {explorerUrl(networkId, done.hash) ? (
            <a
              href={explorerUrl(networkId, done.hash)!}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] text-text-faint"
            >
              {t('seeBlockchain')}
            </a>
          ) : null}
        </TxResult>
        <button type="button" className="btn btn-primary btn-block" onClick={() => setDone(null)}>
          {t('makeAnotherSwap')}
        </button>
      </>
    );

  const options = (['usdc', 'native'] as const).map((token) => ({
    value: token,
    symbol: symbol(token),
    label:
      token === 'usdc'
        ? 'USD Coin'
        : (walletAssets([networkId]).find((coin) => coin.symbol === native.symbol)?.name ??
          native.name),
  }));
  const calls = current ? swapCalls(network, session.wallet.address, current, minimum) : [];

  return (
    <>
      <BackHeader title={t('swap')} to="/move" />
      <MoneyPanel className="mb-2">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[13px] text-text-muted">{t('youSwap')}</span>
          {typeof balanceIn === 'bigint' ? (
            <button
              type="button"
              className="-my-3 py-3 text-[12px] text-text-faint"
              onClick={() => setAmount(formatUnits(balanceIn, decimals(tokenIn)))}
            >
              {t('balanceUseAll', { balanceIn: format(balanceIn, tokenIn) })}
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <AmountInput
            name="amount"
            aria-label={t('youSwap')}
            placeholder="0"
            value={amount}
            onChange={setAmount}
            className="tabular min-w-0 flex-1 bg-transparent font-display text-[34px] leading-none text-text placeholder:text-text-faint"
          />
          <TokenSelect
            value={tokenIn}
            options={options}
            onChange={(value) => setTokenIn(value as SwapToken)}
            label={t('currencySwap')}
          />
        </div>
        {tokenIn === 'usdc' ? (
          <ElsewhereNote settings={settings} session={session} className="mt-3" />
        ) : null}
      </MoneyPanel>

      <div className="relative z-10 -my-1 flex justify-center">
        <button
          type="button"
          onClick={() => {
            setTokenIn(tokenOut);
            setAmount('');
          }}
          aria-label={t('flip')}
          className="meli-square-action h-10 w-10 bg-surface text-text"
        >
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m7 4 0 16" />
            <path d="m3 8 4-4 4 4" />
            <path d="m17 20 0-16" />
            <path d="m13 16 4 4 4-4" />
          </svg>
        </button>
      </div>

      <MoneyPanel className="mt-2 mb-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[13px] text-text-muted">{t('receiveEstimated')}</span>
          {quoting ? <span className="h-2 w-2 animate-pulse rounded-[2px] bg-cat-500" /> : null}
        </div>
        <div className="flex items-center gap-3">
          <p className="tabular min-w-0 flex-1 truncate font-display text-[34px] leading-none text-text">
            {current ? format(current.amountOut, tokenOut) : quoting ? '…' : '0'}
          </p>
          <TokenSelect
            value={tokenOut}
            options={options}
            onChange={(value) => {
              if (value !== tokenOut) setTokenIn(tokenOut);
            }}
            label={t('currencyReceive')}
          />
        </div>
      </MoneyPanel>

      {quoteError ? (
        <p role="status" aria-live="polite" className="mb-4 text-center text-[13px] text-danger">
          {quoteError}
        </p>
      ) : null}

      {current ? (
        <div className="mb-5 border border-border bg-surface px-4 py-3 text-[12px]">
          <div className="flex justify-between gap-3 py-1">
            <span className="text-text-faint">{t('receiveLeast')}</span>
            <span>
              {format(minimum, tokenOut)} {symbol(tokenOut)}
            </span>
          </div>
          <div className="flex justify-between gap-3 py-1">
            <span className="text-text-faint">{t('networkFee')}</span>
            <span className="text-growth">{t('coveredGatopago')}</span>
          </div>
          <button
            type="button"
            onClick={() => setDetails((value) => !value)}
            className="mt-2.5 text-[12px] text-text-faint"
          >
            {details ? t('hideDetails') : t('showDetails')}
          </button>
          {details ? (
            <div className="mt-2 pt-2 leading-relaxed text-text-faint">
              <p>
                {t('route')}: Uniswap v3 · {(current.fee / 10_000).toFixed(2)}%
              </p>
              <p>
                {t('priceTolerance')}: {(SLIPPAGE_BPS / 100).toFixed(2)}%
              </p>
              <p>
                {t('network')}: {networkName(networkId)}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {current && !enough ? (
        <p role="status" className="mb-4 text-center text-[13px] text-danger">
          {t('notEnoughBalance')}
        </p>
      ) : null}

      <TransactionActions hint={t('gatopagoPaysNetworkFee')}>
        <button
          type="button"
          disabled={!current || quoting || !enough}
          className="btn btn-primary btn-block"
          onClick={() => {
            setError('');
            setReviewing(true);
          }}
        >
          {quoting ? t('findingBestRoute') : t('reviewSwap')}
        </button>
      </TransactionActions>

      {reviewing && current ? (
        <ConfirmSheet
          title={t('reviewSwap')}
          amountLabel={t('youSwap')}
          amount={formatAmount(
            current.amountIn,
            decimals(tokenIn),
            locale,
            tokenIn === 'usdc' ? 2 : 0,
          )}
          unit={symbol(tokenIn)}
          warning={t('priceMoveLittleBefore')}
          confirmLabel={t('confirmSwap')}
          busy={busy}
          busyLabel={t('confirmDevice')}
          error={error}
          onCancel={() => setReviewing(false)}
          onConfirm={() =>
            void run(async () => {
              const hash = await send(settings, session, networkId, calls);
              setDone({ quote: current, hash });
              setReviewing(false);
              setAmount('');
              refresh();
            })
          }
        >
          <ConfirmDetails
            rows={[
              [t('receiveEstimated'), `${format(current.amountOut, tokenOut)} ${symbol(tokenOut)}`],
              [t('receiveLeast'), `${format(minimum, tokenOut)} ${symbol(tokenOut)}`],
            ]}
          />
          <SigningDetails wallet={session.wallet} networkId={networkId} calls={calls} />
        </ConfirmSheet>
      ) : null}
    </>
  );
}
