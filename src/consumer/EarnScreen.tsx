'use client';

import { useEffect, useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { aavePoolAbi, depositCalls, supplyApy, withdrawCalls } from '@gatopago/shared/earn';
import { walletNetwork } from '@gatopago/shared/networks';
import type { ClientSettings } from '../lib/settings';
import { MeliSprite } from '../marketing/MeliSprite';
import { networkName, publicClient, USDC_DECIMALS } from '../wallet/account';
import { send } from '../wallet/operations';
import { formatBalance, formatUsdc, useBalances } from '../wallet/balances';
import { failureMessage } from '../wallet/messages';
import type { Session } from '../wallet/session';
import { ElsewhereNote } from './ElsewhereNote';
import { ConfirmSheet, SigningDetails } from './PaymentSheets';
import { MoneyPanel, TabHeader } from './Primitives';
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
  const [amount, setAmount] = useState('');
  const [all, setAll] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
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
    typeof balance === 'bigint' ? formatBalance(balance, en) : '—';
  const rate =
    apy === null ? '—' : apy.toLocaleString(en ? 'en' : 'es', { maximumFractionDigits: 2 });

  if (!network.aave)
    return (
      <>
        <TabHeader title={en ? 'Grow' : 'Crecer'} />
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
        <TabHeader title={en ? 'Grow' : 'Crecer'} />
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
          amount={formatUsdc(done.amount, en)}
          unit="USDC"
          body={
            en
              ? 'You will see it in your balance in a few seconds.'
              : 'Lo verás reflejado en tu saldo en unos segundos.'
          }
        >
          <button
            type="button"
            className="btn btn-primary btn-block mt-6"
            onClick={() => setDone(null)}
          >
            {en ? 'Done' : 'Listo'}
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
      <TabHeader
        title={en ? 'Grow' : 'Crecer'}
        description={
          en
            ? 'Earn interest on the USDC you are not using and withdraw it whenever you want.'
            : 'Gana intereses con los USDC que no estás usando y retíralos cuando quieras.'
        }
      />

      <MoneyPanel className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
        <div className="min-w-0">
          <p className="mb-2 text-[13px] text-text-muted">{en ? 'In Grow' : 'En Crecer'}</p>
          <p className="type-mono text-[clamp(30px,9vw,38px)] font-bold leading-none">
            {shown(savings)} <span className="text-[0.5em]">USDC</span>
          </p>
          <p className="mt-3 inline-flex items-center gap-1.5 border border-growth bg-growth/10 px-2 py-1 text-[12px] font-semibold text-growth">
            {rate}% {en ? 'a year' : 'anual'}
            <span className="font-normal text-text-muted">· variable</span>
          </p>
        </div>
        <MeliSprite
          variant="body-sleeping"
          className="pointer-events-none -mr-2 -mb-3 w-20 min-[390px]:w-24"
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
              : `${en ? 'In Grow' : 'En Crecer'}: ${shown(savings)} USDC`}
          </span>
          <button
            type="button"
            disabled={typeof source !== 'bigint' || source === 0n}
            className="-mr-2 min-h-11 px-2 text-[13px] font-semibold text-cat-700 underline underline-offset-2 disabled:text-text-faint disabled:no-underline"
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
          className="tabular mb-2 w-full bg-transparent font-display text-[34px] leading-none text-text placeholder:text-text-faint"
        />
        {/* Below the amount: "Available" stays next to the field it describes. */}
        {action === 'deposit' ? (
          <ElsewhereNote settings={settings} session={session} english={en} className="mb-3" />
        ) : null}
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
            {action === 'deposit'
              ? en
                ? 'Review deposit'
                : 'Revisar depósito'
              : en
                ? 'Review withdrawal'
                : 'Revisar retiro'}
          </button>
        </div>
      </MoneyPanel>

      <details className="meli-paper-card meli-paper-card--strong px-4 py-3">
        <summary className="min-h-11 cursor-pointer py-3 text-[13px] text-text-muted">
          {en ? 'How it works and its risks' : 'Cómo funciona y sus riesgos'}
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
          {en ? 'Good to know' : 'Antes de empezar'}
        </p>
        <ul className="flex list-disc flex-col gap-1 pb-2 pl-4 text-[12px] leading-relaxed text-text-faint">
          <li>
            {en
              ? 'The rate is variable and not guaranteed.'
              : 'La tasa es variable y no está garantizada.'}
          </li>
          <li>
            {en
              ? 'Your USDC is lent through Aave, a public protocol. Like any smart contract, it carries risk.'
              : 'Tus USDC se prestan a través de Aave, un protocolo público. Como todo contrato inteligente, tiene riesgos.'}
          </li>
          <li>
            {en
              ? 'You can withdraw anytime, as long as Aave has liquidity (so far it always has, instantly).'
              : 'Retiras cuando quieras, mientras Aave tenga liquidez (hasta ahora siempre la tuvo, al instante).'}
          </li>
          <li>
            {en
              ? 'The money is still yours: GatoPago never holds it.'
              : 'El dinero sigue siendo tuyo: GatoPago nunca lo custodia.'}
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
          amount={formatUsdc(review.amount, en)}
          unit="USDC"
          confirmLabel={
            review.action === 'deposit'
              ? en
                ? 'Confirm deposit'
                : 'Confirmar depósito'
              : en
                ? 'Confirm withdrawal'
                : 'Confirmar retiro'
          }
          english={en}
          busy={busy}
          busyLabel={en ? 'Confirm on your device…' : 'Confirma en tu dispositivo…'}
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
                ? 'It moves from your balance to Grow, where it starts earning interest. You can withdraw it whenever you want.'
                : 'Pasa de tu saldo a Crecer, donde empieza a ganar intereses. Puedes retirarlo cuando quieras.'
              : review.all
                ? en
                  ? 'You withdraw everything in Grow, interest included. The final amount may be a little higher.'
                  : 'Retiras todo lo que tienes en Crecer, intereses incluidos. El monto final puede ser un poco mayor.'
                : en
                  ? 'It moves from Grow back to your balance, ready to use.'
                  : 'Vuelve de Crecer a tu saldo, listo para usar.'}
          </p>
          {review.action === 'deposit' ? (
            <p className="mb-5 text-center text-[12px] text-text-faint">
              {en
                ? `Today’s rate: ${rate}% a year. It is variable and not guaranteed.`
                : `Tasa de hoy: ${rate}% anual. Es variable y no está garantizada.`}
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
