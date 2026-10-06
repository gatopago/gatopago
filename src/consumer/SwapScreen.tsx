'use client';

import { useEffect, useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
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
import { explorerUrl, networkName, publicClient, USDC_DECIMALS } from '../wallet/account';
import { send } from '../wallet/operations';
import { useBalances } from '../wallet/balances';
import { failureMessage } from '../wallet/messages';
import type { Session } from '../wallet/session';
import { ConfirmDetails, ConfirmSheet, SigningDetails } from './PaymentSheets';
import { BackHeader, MoneyPanel, TransactionActions } from './Primitives';
import { AmountInput } from './SelectMenu';
import { TokenSelect } from './TokenSelect';
import { TxResult } from './TxResult';

/** Price tolerance applied to every quote (0.5 %). */
const SLIPPAGE_BPS = 50;
/** Typing pauses this long before a quote is requested. */
const QUOTE_DELAY_MS = 400;

/** `/swap`, V2's Swap: USDC and the native token, through Uniswap v3 on the home network. */
export function SwapScreen({
  settings,
  session,
  english: en,
}: {
  settings: ClientSettings;
  session: Session;
  english: boolean;
}) {
  const networkId = settings.homeNetwork;
  const network = walletNetwork(networkId);
  const { balances, natives, refresh } = useBalances(settings, session);
  const [tokenIn, setTokenIn] = useState<SwapToken>('usdc');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [quoting, setQuoting] = useState(false),
    [quoteError, setQuoteError] = useState('');
  const [details, setDetails] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [done, setDone] = useState<{ quote: SwapQuote; hash: `0x${string}` } | null>(null);

  const tokenOut: SwapToken = tokenIn === 'usdc' ? 'native' : 'usdc';
  const native = network.chain.nativeCurrency;
  const symbol = (token: SwapToken) => (token === 'usdc' ? 'USDC' : native.symbol);
  const decimals = (token: SwapToken) => (token === 'usdc' ? USDC_DECIMALS : native.decimals);
  const balanceIn = tokenIn === 'usdc' ? balances[networkId] : natives[networkId];
  const amountIn = /^(\d+\.?\d*|\.\d+)$/.test(amount)
    ? (() => {
        try {
          return parseUnits(amount, decimals(tokenIn));
        } catch {
          return 0n;
        }
      })()
    : 0n;
  const format = (value: bigint, token: SwapToken) =>
    Number(formatUnits(value, decimals(token))).toLocaleString(en ? 'en' : 'es', {
      maximumFractionDigits: token === 'usdc' ? 2 : 6,
    });

  useEffect(() => {
    if (!network.uniswap || amountIn <= 0n) return;
    let active = true;
    const timer = setTimeout(() => {
      setQuoting(true);
      setQuoteError('');
      quoteSwap(publicClient(settings, networkId), network, { tokenIn, tokenOut, amountIn })
        .then((value) => {
          if (active) setQuote(value);
        })
        .catch(() => {
          if (active) setQuoteError(en ? "We couldn't get a quote." : 'No pudimos cotizar.');
        })
        .finally(() => {
          if (active) setQuoting(false);
        });
    }, QUOTE_DELAY_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [settings, networkId, network, tokenIn, tokenOut, amountIn, en]);

  const current = quote && quote.tokenIn === tokenIn && quote.amountIn === amountIn ? quote : null;
  const minimum = current ? minimumOut(current, SLIPPAGE_BPS) : 0n;
  const enough = typeof balanceIn === 'bigint' && amountIn <= balanceIn;

  if (!network.uniswap)
    return (
      <>
        <BackHeader title={en ? 'Swap' : 'Cambiar'} english={en} to="/move" />
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <CatGlyph className="mb-5 w-12 opacity-40" decorative />
          <p className="mb-1 text-[15px]">
            {en ? 'Swaps are not available yet' : 'Los cambios aún no están disponibles'}
          </p>
          <p className="max-w-[260px] text-[13px] leading-relaxed text-text-muted">
            {en
              ? `We're preparing this feature on ${networkName(networkId)}. Check back soon.`
              : `Estamos preparando esta función en ${networkName(networkId)}. Vuelve pronto.`}
          </p>
        </div>
      </>
    );

  if (done)
    return (
      <>
        <BackHeader title={en ? 'Swap' : 'Cambiar'} english={en} to="/move" />
        <TxResult
          state="success"
          lead={en ? 'Done! You received about' : '¡Listo! Recibiste aproximadamente'}
          amount={format(done.quote.amountOut, done.quote.tokenOut)}
          unit={symbol(done.quote.tokenOut)}
          body={en ? 'Your funds are already updated.' : 'Tus fondos ya están actualizados.'}
        >
          {explorerUrl(networkId, done.hash) ? (
            <a
              href={explorerUrl(networkId, done.hash)!}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] text-text-faint"
            >
              {en ? 'View receipt on the network ↗' : 'Ver comprobante en la red ↗'}
            </a>
          ) : null}
        </TxResult>
        <button type="button" className="btn btn-primary btn-block" onClick={() => setDone(null)}>
          {en ? 'Make another swap' : 'Hacer otro cambio'}
        </button>
      </>
    );

  const options = (['usdc', 'native'] as const).map((token) => ({
    value: token,
    symbol: symbol(token),
    label: token === 'usdc' ? 'USD Coin' : native.name,
  }));
  const calls = current ? swapCalls(network, session.wallet.address, current, minimum) : [];

  return (
    <>
      <BackHeader title={en ? 'Swap' : 'Cambiar'} english={en} to="/move" />
      <MoneyPanel className="mb-2">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[13px] text-text-muted">{en ? 'You swap' : 'Cambias'}</span>
          {typeof balanceIn === 'bigint' ? (
            <button
              type="button"
              className="text-[12px] text-text-faint"
              onClick={() => setAmount(formatUnits(balanceIn, decimals(tokenIn)))}
            >
              {en
                ? `Balance: ${format(balanceIn, tokenIn)} · Use all`
                : `Saldo: ${format(balanceIn, tokenIn)} · Usar todo`}
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <AmountInput
            name="amount"
            aria-label={en ? 'You swap' : 'Cambias'}
            placeholder="0"
            value={amount}
            onChange={setAmount}
            className="tabular min-w-0 flex-1 bg-transparent font-display text-[34px] leading-none text-text placeholder:text-text-faint"
          />
          <TokenSelect
            value={tokenIn}
            options={options}
            onChange={(value) => setTokenIn(value as SwapToken)}
            english={en}
            label={en ? 'Currency to swap' : 'Moneda que cambias'}
          />
        </div>
      </MoneyPanel>

      <div className="relative z-10 -my-1 flex justify-center">
        <button
          type="button"
          onClick={() => {
            setTokenIn(tokenOut);
            setAmount('');
          }}
          aria-label={en ? 'Flip' : 'Invertir'}
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
          <span className="text-[13px] text-text-muted">
            {en ? 'You receive (estimated)' : 'Recibes (estimado)'}
          </span>
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
            english={en}
            label={en ? 'Currency you receive' : 'Moneda que recibes'}
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
            <span className="text-text-faint">
              {en ? 'You receive at least' : 'Recibirás como mínimo'}
            </span>
            <span>
              {format(minimum, tokenOut)} {symbol(tokenOut)}
            </span>
          </div>
          <div className="flex justify-between gap-3 py-1">
            <span className="text-text-faint">{en ? 'Network fee' : 'Comisión de red'}</span>
            <span className="text-growth">
              {en ? 'Covered by GatoPago' : 'Cubierta por GatoPago'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setDetails((value) => !value)}
            className="mt-2.5 text-[12px] text-text-faint"
          >
            {details
              ? en
                ? 'Hide details'
                : 'Ocultar detalles'
              : en
                ? 'Show details'
                : 'Ver detalles'}
          </button>
          {details ? (
            <div className="mt-2 pt-2 leading-relaxed text-text-faint">
              <p>
                {en ? 'Route' : 'Ruta'}: Uniswap v3 · {(current.fee / 10_000).toFixed(2)}%
              </p>
              <p>
                {en ? 'Price tolerance' : 'Tolerancia de precio'}: {(SLIPPAGE_BPS / 100).toFixed(2)}
                %
              </p>
              <p>
                {en ? 'Network' : 'Red'}: {networkName(networkId)}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {current && !enough ? (
        <p role="status" className="mb-4 text-center text-[13px] text-danger">
          {en ? 'Not enough balance.' : 'No te alcanza el saldo.'}
        </p>
      ) : null}

      <TransactionActions
        hint={
          en
            ? 'You confirm with your fingerprint. GatoPago covers gas; the breakdown shows any other cost.'
            : 'Confirmas con tu huella. GatoPago cubre el gas; el desglose muestra cualquier otro costo.'
        }
      >
        <button
          type="button"
          disabled={!current || quoting || !enough}
          className="btn btn-primary btn-block"
          onClick={() => {
            setError('');
            setReviewing(true);
          }}
        >
          {quoting
            ? en
              ? 'Finding the best route…'
              : 'Buscando mejor ruta…'
            : en
              ? 'Swap'
              : 'Cambiar'}
        </button>
      </TransactionActions>

      {reviewing && current ? (
        <ConfirmSheet
          title={en ? 'Review swap' : 'Revisar cambio'}
          amountLabel={en ? 'You swap' : 'Cambias'}
          amount={format(current.amountIn, tokenIn)}
          unit={symbol(tokenIn)}
          warning={
            en
              ? 'The price may move within the stated tolerance. Check the minimum before confirming.'
              : 'El precio puede variar dentro de la tolerancia indicada. Revisa el mínimo antes de confirmar.'
          }
          confirmLabel={en ? 'Confirm swap' : 'Confirmar cambio'}
          english={en}
          busy={busy}
          busyLabel={en ? 'Confirm with your fingerprint' : 'Confirma con tu huella'}
          error={error}
          onCancel={() => setReviewing(false)}
          onConfirm={() => {
            setBusy(true);
            setError('');
            send(settings, session, networkId, calls)
              .then((hash) => {
                setDone({ quote: current, hash });
                setReviewing(false);
                setAmount('');
                refresh();
              })
              .catch((failure: unknown) => setError(failureMessage(failure, en)))
              .finally(() => setBusy(false));
          }}
        >
          <ConfirmDetails
            rows={[
              [
                en ? 'You receive (estimated)' : 'Recibes (estimado)',
                `${format(current.amountOut, tokenOut)} ${symbol(tokenOut)}`,
              ],
              [
                en ? 'You receive at least' : 'Recibirás como mínimo',
                `${format(minimum, tokenOut)} ${symbol(tokenOut)}`,
              ],
            ]}
          />
          <SigningDetails
            settings={settings}
            wallet={session.wallet}
            networkId={networkId}
            calls={calls}
            english={en}
          />
        </ConfirmSheet>
      ) : null}
    </>
  );
}
