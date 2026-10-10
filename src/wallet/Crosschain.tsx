'use client';

import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAction } from './useAction';
import { formatUnits, parseUnits, type Address, type Hex } from 'viem';
import { crosschainCalls, crosschainFee } from '@gatopago/shared/crosschain';
import { walletNetwork } from '@gatopago/shared/networks';
import { NavigationLink } from '../consumer/NavigationLink';
import { BackHeader, MoneyPanel, TransactionActions } from '../consumer/Primitives';
import { AmountInput, SelectMenu } from '../consumer/SelectMenu';
import { CrosschainTimeline } from '../consumer/CrosschainTimeline';
import { ConfirmDetails, ConfirmSheet, SigningDetails } from '../consumer/PaymentSheets';
import { StageOverlay } from '../consumer/StageOverlay';
import { TxResult } from '../consumer/TxResult';
import { localizedPath } from '../consumer/routes';
import type { ClientSettings } from '../lib/settings';
import { cctpNetwork, networkName, USDC_DECIMALS } from './account';
import { send } from './operations';
import { formatBalance, formatUsdc, useBalances } from './balances';
import { crossingsOf, forgetCrossing, rememberCrossing, type Crossing } from './crossings';
import type { Session } from './session';
import {
  crosschainFromStellar,
  crosschainToStellar,
  stellarArrived,
  stellarBurnsAllowed,
} from './stellar';

/**
 * A crossing; `calls` burn on an EVM network, `null` when it leaves from Stellar, where
 * `allowance` says Circle's permission to move the USDC is signed first.
 */
type Move = {
  from: string;
  to: string;
  amount: bigint;
  fee: bigint;
  calls: readonly { to: Address; data: Hex }[] | null;
  allowance: boolean;
};

/** Moves the user's own USDC between networks with Circle's CCTP, by default to the home network. */
export function Crosschain({
  settings,
  session,
  english: en,
}: {
  settings: ClientSettings;
  session: Session;
  english: boolean;
}) {
  const { balances, stellar, stellarUsdc, refresh } = useBalances(settings, session);
  const stellarId = stellar ? settings.stellar!.network : null;
  const balanceOf = (id: string) => (id === stellarId ? stellarUsdc : balances[id]);
  const others = settings.networks.filter((id) => id !== settings.homeNetwork);
  // "Bring it" (the note about USDC on other networks) names where it comes from.
  const requested = useSearchParams().get('from');
  const [from, setFrom] = useState(
    requested &&
      requested !== settings.homeNetwork &&
      (settings.networks.includes(requested) || requested === settings.stellar?.network)
      ? requested
      : (others[0] ?? settings.homeNetwork),
  );
  const [to, setTo] = useState(settings.homeNetwork);
  const [amount, setAmount] = useState('');
  const [review, setReview] = useState<Move | null>(null);
  // `arrived` once the timeline sees the USDC on the destination: the result says so too.
  const [moved, setMoved] = useState<(Crossing & { arrived?: boolean }) | null>(null);
  // Crossings this device confirmed that are still on their way: a reload or leaving comes back.
  const account = session.wallet.address;
  const [onTheirWay, setOnTheirWay] = useState(() => crossingsOf(account));
  const { busy, error, run: perform } = useAction(en);
  // From Stellar without Circle's permission: which of the two signatures is being asked.
  const [step, setStep] = useState<'allowance' | 'move' | null>(null);

  const value = /^(\d+\.?\d{0,6}|\.\d{1,6})$/.test(amount) ? parseUnits(amount, USDC_DECIMALS) : 0n;
  const available = balanceOf(from);
  const enough = typeof available !== 'bigint' || value <= available;
  const locked = busy || review !== null;

  function prepare(event: FormEvent) {
    event.preventDefault();
    perform(async () => {
      if (value <= 0n || from === to) throw new Error('INVALID_AMOUNT');
      if (value > (balanceOf(from) ?? 0n)) throw new Error('INSUFFICIENT_FUNDS');
      const fee = await crosschainFee(cctpNetwork(from), cctpNetwork(to), value);
      if (fee >= value) throw new Error('CCTP_AMOUNT_BELOW_FEE');
      const move = { from, to, amount: value, fee };
      setReview({
        ...move,
        allowance: from === stellarId && !(await stellarBurnsAllowed(settings, session, value)),
        calls:
          from === stellarId
            ? null
            : to === stellarId
              ? await crosschainToStellar(settings, session, move)
              : crosschainCalls({
                  from: walletNetwork(from),
                  to: walletNetwork(to),
                  amount: value,
                  recipient: session.wallet.address,
                  maxFee: fee,
                }),
      });
    });
  }

  function confirm(move: Move) {
    perform(async () => {
      let hash: string;
      if (!move.calls)
        hash = await crosschainFromStellar(settings, session, move, setStep).finally(() =>
          setStep(null),
        );
      else {
        hash = await send(settings, session, move.from, move.calls);
        // Wallet Core delivers burns toward Stellar; the timeline reports it again if this is lost.
        if (move.to === stellarId)
          void stellarArrived(settings, session, move.from, hash).catch(() => undefined);
      }
      const crossing = { from: move.from, to: move.to, amount: move.amount.toString(), hash };
      rememberCrossing(account, crossing);
      setOnTheirWay(crossingsOf(account));
      setMoved({ ...crossing, at: Date.now() });
      setReview(null);
      setAmount('');
      refresh();
    });
  }

  const networks = [...settings.networks, ...(stellarId ? [stellarId] : [])].map((id) => {
    const balance = balanceOf(id);
    return {
      value: id,
      label: networkName(id),
      description: typeof balance === 'bigint' ? `${formatBalance(balance, en)} USDC` : undefined,
      network: id,
    };
  });
  // Choosing the other side's network swaps them: origin and destination are never the same.
  const choose = (side: 'from' | 'to', id: string) => {
    if (side === 'from') {
      if (id === to) setTo(from);
      setFrom(id);
    } else {
      if (id === from) setFrom(to);
      setTo(id);
    }
  };

  return (
    <>
      <BackHeader title={en ? 'Between networks' : 'Entre redes'} english={en} to="/move" />
      <StageOverlay
        label={
          busy && !review && !moved
            ? en
              ? 'Preparing the move…'
              : 'Preparando el movimiento…'
            : null
        }
      />
      {error && !review ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      {moved ? (
        <TxResult
          state={moved.arrived ? 'success' : 'pending'}
          lead={moved.arrived ? (en ? 'It arrived' : 'Ya llegó') : en ? 'On its way' : 'En camino'}
          amount={formatUsdc(BigInt(moved.amount), en)}
          unit="USDC"
          body={`${networkName(moved.from)} → ${networkName(moved.to)}`}
        >
          <div className="mt-4 mb-6 w-full">
            <CrosschainTimeline
              from={moved.from}
              to={moved.to}
              hash={moved.hash}
              english={en}
              onDelivered={() => {
                forgetCrossing(account, moved.hash);
                setOnTheirWay(crossingsOf(account));
                setMoved((current) => current && { ...current, arrived: true });
                refresh();
              }}
              delivery={
                moved.to === stellarId
                  ? () => stellarArrived(settings, session, moved.from, moved.hash)
                  : undefined
              }
            />
          </div>
          <NavigationLink href={localizedPath('/app', en)} className="btn btn-primary btn-block">
            {en ? 'Go to home' : 'Ir al inicio'}
          </NavigationLink>
          <button type="button" className="btn-text mt-1 w-full" onClick={() => setMoved(null)}>
            {en ? 'Move more' : 'Mover más'}
          </button>
        </TxResult>
      ) : (
        <form onSubmit={prepare} aria-busy={busy} className="flex flex-1 flex-col">
          {onTheirWay.length ? (
            <div className="meli-paper-card mb-3 divide-y divide-border" aria-live="polite">
              {onTheirWay.map((crossing) => (
                <button
                  key={crossing.hash}
                  type="button"
                  disabled={locked}
                  onClick={() => setMoved(crossing)}
                  className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2 text-left text-[13px]"
                >
                  <span className="min-w-0 truncate">
                    {formatUsdc(BigInt(crossing.amount), en)} USDC · {networkName(crossing.from)} →{' '}
                    {networkName(crossing.to)}
                  </span>
                  <span className="shrink-0 text-pending">
                    {en ? 'On its way · See' : 'En camino · Ver'}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          <MoneyPanel className="mb-2">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-[13px] text-text-muted">{en ? 'From' : 'Desde'}</span>
              {typeof available === 'bigint' && available > 0n ? (
                <button
                  type="button"
                  className="-my-3 py-3 text-[12px] text-text-faint"
                  disabled={locked}
                  onClick={() => setAmount(formatUnits(available, USDC_DECIMALS))}
                >
                  {en
                    ? `Balance: ${formatBalance(available, en)} · Move all`
                    : `Saldo: ${formatBalance(available, en)} · Mover todo`}
                </button>
              ) : null}
            </div>
            <SelectMenu
              label={en ? 'Network it leaves from' : 'Red de origen'}
              showLabel={false}
              value={from}
              options={networks}
              onChange={(id) => choose('from', id)}
              english={en}
              disabled={locked}
              className="mb-4"
            />
            <AmountInput
              name="amount"
              aria-label={en ? 'Amount in USDC' : 'Monto en USDC'}
              placeholder="0"
              value={amount}
              onChange={setAmount}
              disabled={locked}
              className="tabular w-full bg-transparent font-display text-[34px] leading-none text-text placeholder:text-text-faint"
            />
          </MoneyPanel>

          <div className="relative z-10 -my-1 flex justify-center">
            <button
              type="button"
              disabled={locked}
              onClick={() => {
                setFrom(to);
                setTo(from);
                setAmount('');
              }}
              aria-label={en ? 'Flip networks' : 'Invertir redes'}
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
            <span className="mb-3 block text-[13px] text-text-muted">{en ? 'To' : 'Hacia'}</span>
            <SelectMenu
              label={en ? 'Network it arrives on' : 'Red de destino'}
              showLabel={false}
              value={to}
              options={networks}
              onChange={(id) => choose('to', id)}
              english={en}
              disabled={locked}
            />
            <p className="mt-3 text-[12px] leading-relaxed text-text-faint">
              {en
                ? 'It arrives in your own account. Circle charges a small fee, which you will see before confirming.'
                : 'Llega a tu misma cuenta. Circle cobra una pequeña comisión, que verás antes de confirmar.'}
            </p>
          </MoneyPanel>

          {!enough ? (
            <p role="status" className="mb-4 text-center text-[13px] text-danger">
              {en ? 'Not enough balance on that network.' : 'No te alcanza el saldo en esa red.'}
            </p>
          ) : null}

          <TransactionActions
            hint={
              <>
                {en
                  ? `Your balance lives on ${networkName(settings.homeNetwork)}. To receive from another network, share `
                  : `Tu saldo vive en ${networkName(settings.homeNetwork)}. Para recibir desde otra red, comparte `}
                <NavigationLink
                  href={localizedPath('/receive', en)}
                  className="-my-3 inline-block py-3 underline"
                >
                  {en ? 'your address' : 'tu dirección'}
                </NavigationLink>
                {en ? ': it is the same on every network.' : ': es la misma en todas las redes.'}
              </>
            }
          >
            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={busy || value <= 0n || !enough}
            >
              {busy
                ? en
                  ? 'Checking…'
                  : 'Comprobando…'
                : en
                  ? 'Review move'
                  : 'Revisar movimiento'}
            </button>
          </TransactionActions>
        </form>
      )}
      {review ? (
        <ConfirmSheet
          title={en ? 'Confirm the move' : 'Confirma el movimiento'}
          amountLabel={en ? 'You will move' : 'Vas a mover'}
          amount={formatUsdc(review.amount, en)}
          unit="USDC"
          warning={
            (en
              ? 'Your USDC leaves this network and Circle delivers it to your same account on the destination. GatoPago covers gas.'
              : 'Tus USDC salen de esta red y Circle los entrega en tu misma cuenta en el destino. GatoPago cubre el gas.') +
            (review.allowance
              ? en
                ? ' You will confirm twice: first a permission for Circle to move your USDC on Stellar (it lasts about six months), then the move.'
                : ' Vas a confirmar dos veces: primero un permiso para que Circle mueva tus USDC en Stellar (dura unos seis meses), después el movimiento.'
              : '')
          }
          confirmLabel={en ? 'Confirm and move' : 'Confirmar y mover'}
          english={en}
          busy={busy}
          busyLabel={
            step === 'allowance'
              ? en
                ? 'Step 1 of 2: confirm the permission for Circle on your device…'
                : 'Paso 1 de 2: confirma en tu dispositivo el permiso para Circle…'
              : step === 'move' && review.allowance
                ? en
                  ? 'Step 2 of 2: confirm the move on your device…'
                  : 'Paso 2 de 2: confirma el movimiento en tu dispositivo…'
                : en
                  ? 'Confirm on your device. Moving your money…'
                  : 'Confirma en tu dispositivo. Moviendo tu dinero…'
          }
          error={error}
          onConfirm={() => confirm(review)}
          onCancel={() => setReview(null)}
        >
          <ConfirmDetails
            rows={[
              [en ? 'From' : 'Desde', networkName(review.from)],
              [en ? 'To' : 'Hacia', networkName(review.to)],
              [
                en ? 'Circle transfer fee' : 'Comisión de Circle',
                `${en ? 'up to' : 'hasta'} ${formatUsdc(review.fee, en)} USDC`,
              ],
            ]}
          />
          {review.calls ? (
            <SigningDetails
              wallet={session.wallet}
              networkId={review.from}
              calls={review.calls}
              english={en}
            />
          ) : null}
        </ConfirmSheet>
      ) : null}
    </>
  );
}
