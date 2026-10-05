'use client';

import { useEffect, useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { aavePoolAbi, depositCalls, supplyApy, withdrawCalls } from '@gatopago/shared/earn';
import { walletNetwork } from '@gatopago/shared/networks';
import type { ClientSettings } from '../lib/settings';
import { MeliSprite } from '../marketing/MeliSprite';
import { networkName, publicClient, send, USDC_DECIMALS } from '../wallet/account';
import { formatUsdc, useBalances } from '../wallet/balances';
import { failureMessage } from '../wallet/messages';
import type { Session } from '../wallet/session';
import { ConfirmSheet, SigningDetails } from './PaymentSheets';
import { BackHeader, MoneyPanel } from './Primitives';
import { PixelRail } from './PixelRail';
import { AmountInput } from './SelectMenu';
import { TxResult } from './TxResult';

type Action = 'deposit' | 'withdraw';
type Review = { action: Action; amount: bigint; all: boolean };

/** `/earn`, V2's Grow: USDC supplied to Aave V3 from the account on the home network. */
export function EarnScreen({
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
  const { balances, saved, refresh } = useBalances(settings, session);
  const [apy, setApy] = useState<number | null>(null);
  const [action, setAction] = useState<Action>('deposit');
  const [amount, setAmount] = useState(''),
    [all, setAll] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [done, setDone] = useState<Review | null>(null);

  // The rate is read once per visit, from Aave's own reserve data.
  useEffect(() => {
    if (!network.aave) return;
    let active = true;
    publicClient(settings, networkId)
      .readContract({
        address: network.aave.pool,
        abi: aavePoolAbi,
        functionName: 'getReserveData',
        args: [network.usdc],
      })
      .then((reserve) => {
        if (active) setApy(supplyApy(reserve.currentLiquidityRate));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [settings, networkId, network]);

  const available = balances[networkId];
  const savings = saved[networkId];
  const source = action === 'deposit' ? available : savings;
  const value = /^(\d+\.?\d{0,6}|\.\d{1,6})$/.test(amount) ? parseUnits(amount, USDC_DECIMALS) : 0n;
  const canContinue =
    typeof source === 'bigint' && source > 0n && (all || (value > 0n && value <= source));
  const shown = (balance: bigint | null | undefined) =>
    typeof balance === 'bigint' ? formatUsdc(balance) : '—';
  const rate =
    apy === null ? '—' : apy.toLocaleString(en ? 'en' : 'es', { maximumFractionDigits: 2 });

  if (!network.aave)
    return (
      <>
        <BackHeader title={en ? 'Grow' : 'Crecer'} english={en} />
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <MeliSprite variant="head-cautious" className="mb-5 w-24" />
          <p className="font-display text-[22px]">
            {en
              ? `Grow isn't available on ${networkName(networkId)}`
              : `Crecer no está disponible en ${networkName(networkId)}`}
          </p>
        </div>
      </>
    );

  if (done)
    return (
      <>
        <BackHeader title={en ? 'Grow' : 'Crecer'} english={en} />
        <TxResult
          state="success"
          lead={
            done.action === 'deposit'
              ? en
                ? 'Deposit complete'
                : 'Depósito realizado'
              : en
                ? 'Withdrawal complete'
                : 'Retiro realizado'
          }
          amount={formatUsdc(done.amount)}
          unit="USDC"
          body={
            en
              ? 'Your savings will update in a few seconds.'
              : 'Tu ahorro se actualizará en unos segundos.'
          }
        >
          <button
            type="button"
            className="btn btn-primary btn-block mt-6"
            onClick={() => setDone(null)}
          >
            {en ? 'Back' : 'Volver'}
          </button>
        </TxResult>
      </>
    );

  const calls = review
    ? review.action === 'deposit'
      ? depositCalls(network, session.wallet.address, review.amount)
      : withdrawCalls(network, session.wallet.address, review.all ? 'all' : review.amount)
    : [];

  return (
    <>
      <header className="mb-6">
        <p className="meli-kicker mb-3">{en ? 'Money at work' : 'Dinero trabajando'}</p>
        <h1 className="font-display text-[36px] leading-[.94]">{en ? 'Grow' : 'Crecer'}</h1>
        <p className="mt-3 text-[13px] leading-relaxed text-text-muted">
          {en
            ? 'Grow USDC through a flexible position. The rate can change and your funds remain under your control.'
            : 'Haz crecer USDC con una posición flexible. La tasa puede cambiar y tus fondos siguen bajo tu control.'}
        </p>
      </header>
      <PixelRail state="done" className="mb-5" />

      <MoneyPanel className="mb-4 min-h-[150px] pr-24">
        <p className="mb-2 text-[13px] text-text-muted">{en ? 'Growing now' : 'Creciendo ahora'}</p>
        <p className="type-mono mb-2 text-[38px] font-bold leading-none">
          {shown(savings)} <span className="text-[20px]">USDC</span>
        </p>
        <p className="text-[12px] text-text-faint">
          {en
            ? `Current rate: ${rate}% per year (variable, not guaranteed)`
            : `Tasa actual: ${rate}% anual (variable, no garantizada)`}
        </p>
        <MeliSprite
          variant="body-sleeping"
          className="pointer-events-none absolute -right-2 -bottom-3 w-28"
          loading="eager"
        />
      </MoneyPanel>

      <MoneyPanel className="mb-4">
        <div className="seg-track mb-4 w-full">
          {(['deposit', 'withdraw'] as const).map((next) => (
            <button
              key={next}
              type="button"
              aria-pressed={action === next}
              data-active={action === next}
              className="seg-item flex-1"
              onClick={() => {
                setAction(next);
                setAmount('');
                setAll(false);
              }}
            >
              {next === 'deposit' ? (en ? 'Deposit' : 'Depositar') : en ? 'Withdraw' : 'Retirar'}
            </button>
          ))}
        </div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[13px] text-text-muted">
            {action === 'deposit'
              ? `${en ? 'Available' : 'Disponible'}: ${shown(available)} USDC`
              : `${en ? 'Saved' : 'Ahorrado'}: ${shown(savings)} USDC`}
          </span>
          <button
            type="button"
            disabled={typeof source !== 'bigint' || source === 0n}
            className="min-h-11 text-[12px] text-text-faint"
            onClick={() => {
              if (typeof source !== 'bigint') return;
              setAmount(formatUnits(source, USDC_DECIMALS));
              // Withdrawing everything uses Aave's sentinel, so interest accrued until it runs is included.
              setAll(action === 'withdraw');
            }}
          >
            {en ? 'Use all' : 'Usar todo'}
          </button>
        </div>
        <AmountInput
          name="amount"
          aria-label={en ? 'Amount in USDC' : 'Monto en USDC'}
          placeholder="0"
          value={amount}
          onChange={(next) => {
            setAmount(next);
            setAll(false);
          }}
          className="tabular mb-4 w-full bg-transparent font-display text-[34px] leading-none text-text placeholder:text-text-faint"
        />
        {error && !review ? (
          <p role="alert" className="mb-3 text-center text-[13px] text-danger">
            {error}
          </p>
        ) : null}
        <div className="pt-5">
          <button
            type="button"
            disabled={!canContinue}
            className="btn btn-primary btn-block"
            onClick={() => {
              setError('');
              setReview({ action, amount: all && savings ? savings : value, all });
            }}
          >
            {en ? 'Continue' : 'Continuar'}
          </button>
        </div>
      </MoneyPanel>

      <details className="meli-paper-card meli-paper-card--strong px-4 py-3">
        <summary className="min-h-11 cursor-pointer py-3 text-[13px] text-text-muted">
          {en ? 'Protocol, risks, and technical details' : 'Protocolo, riesgos y detalles técnicos'}
        </summary>
        <dl className="grid gap-3 pt-4 text-[12px]">
          <div className="flex justify-between gap-4">
            <dt className="text-text-faint">{en ? 'Protocol' : 'Protocolo'}</dt>
            <dd>Aave V3</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-faint">{en ? 'Network' : 'Red'}</dt>
            <dd>{networkName(networkId)}</dd>
          </div>
          <div>
            <dt className="mb-1 text-text-faint">{en ? 'Pool contract' : 'Contrato Pool'}</dt>
            <dd className="break-all font-mono text-[11px]">{network.aave.pool}</dd>
            {network.chain.blockExplorers ? (
              <a
                className="mt-2 inline-block text-info"
                href={`${network.chain.blockExplorers.default.url}/address/${network.aave.pool}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {en ? 'View in explorer' : 'Ver en explorador'} ↗
              </a>
            ) : null}
          </div>
        </dl>
        <p className="mt-5 mb-2 text-[12px] text-text-muted">
          {en ? 'What you should know' : 'Lo que debes saber'}
        </p>
        <ul className="flex list-disc flex-col gap-1 pb-2 pl-4 text-[12px] leading-relaxed text-text-faint">
          <li>
            {en
              ? 'The rate is variable and not guaranteed.'
              : 'La tasa es variable y no está garantizada.'}
          </li>
          <li>
            {en
              ? 'Your funds are lent through Aave, a public protocol; smart-contract risk exists.'
              : 'Tus fondos se prestan a través de Aave, un protocolo público; existe riesgo de contrato inteligente.'}
          </li>
          <li>
            {en
              ? 'Withdraw anytime (subject to protocol liquidity, historically instant).'
              : 'Retiras cuando quieras (sujeto a la liquidez del protocolo, históricamente inmediata).'}
          </li>
          <li>
            {en
              ? 'Your funds remain yours: GatoPago never holds custody.'
              : 'Tus fondos siguen siendo tuyos: GatoPago nunca los custodia.'}
          </li>
        </ul>
      </details>

      {review ? (
        <ConfirmSheet
          title={
            review.action === 'deposit'
              ? en
                ? 'Confirm deposit'
                : 'Confirmar depósito'
              : en
                ? 'Confirm withdrawal'
                : 'Confirmar retiro'
          }
          amount={formatUsdc(review.amount)}
          unit="USDC"
          confirmLabel={en ? 'Confirm with your fingerprint' : 'Confirmar con tu huella'}
          english={en}
          busy={busy}
          busyLabel={en ? 'Confirm with your fingerprint' : 'Confirma con tu huella'}
          error={error}
          onCancel={() => setReview(null)}
          onConfirm={() => {
            setBusy(true);
            setError('');
            send(settings, session, networkId, calls)
              .then(() => {
                setDone(review);
                setReview(null);
                setAmount('');
                setAll(false);
                refresh();
              })
              .catch((failure: unknown) => setError(failureMessage(failure, en)))
              .finally(() => setBusy(false));
          }}
        >
          <p className="mb-3 text-center text-[13px] leading-relaxed text-text-muted">
            {review.action === 'deposit'
              ? en
                ? `You're moving ${formatUsdc(review.amount)} USDC from your available balance into your savings. Withdraw anytime.`
                : `Vas a mover ${formatUsdc(review.amount)} USDC de tu saldo disponible a tu ahorro. Puedes retirarlo cuando quieras.`
              : review.all
                ? en
                  ? `You're withdrawing all your savings (~${formatUsdc(review.amount)} USDC, including accrued interest).`
                  : `Vas a retirar todo tu ahorro (~${formatUsdc(review.amount)} USDC, incluye los intereses acumulados).`
                : en
                  ? `You're moving ${formatUsdc(review.amount)} USDC from your savings back to your available balance.`
                  : `Vas a mover ${formatUsdc(review.amount)} USDC de tu ahorro a tu saldo disponible.`}
          </p>
          {review.action === 'deposit' ? (
            <p className="mb-5 text-center text-[12px] text-text-faint">
              {en
                ? `Current rate: ${rate}% per year (variable, not guaranteed)`
                : `Tasa actual: ${rate}% anual (variable, no garantizada)`}
            </p>
          ) : null}
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
