'use client';

import { useState, type FormEvent } from 'react';
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
import { failureMessage } from './messages';
import type { Session } from './session';
import { crosschainFromStellar, crosschainToStellar, stellarArrived } from './stellar';

/** A crossing; `calls` burn on an EVM network, `null` when it leaves from Stellar. */
type Move = {
  from: string;
  to: string;
  amount: bigint;
  fee: bigint;
  calls: readonly { to: Address; data: Hex }[] | null;
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
  const [from, setFrom] = useState(others[0] ?? settings.homeNetwork);
  const [to, setTo] = useState(settings.homeNetwork);
  const [amount, setAmount] = useState('');
  const [review, setReview] = useState<Move | null>(null);
  const [moved, setMoved] = useState<{ hash: string; move: Move } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');

  function perform(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    action()
      .catch((failure: unknown) => setError(failureMessage(failure, en)))
      .finally(() => setBusy(false));
  }

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
      if (!move.calls) hash = await crosschainFromStellar(settings, session, move);
      else {
        hash = await send(settings, session, move.from, move.calls);
        // Wallet Core delivers burns toward Stellar; the timeline reports it again if this is lost.
        if (move.to === stellarId)
          void stellarArrived(settings, session, move.from, hash).catch(() => undefined);
      }
      setMoved({ hash, move });
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
      tone: 'info' as const,
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
        label={busy && !review ? (en ? 'Preparing the move…' : 'Preparando el movimiento…') : null}
      />
      {error && !review ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      {moved ? (
        <TxResult
          state="pending"
          lead={en ? 'On its way' : 'En camino'}
          amount={formatUsdc(moved.move.amount, en)}
          unit="USDC"
          body={`${networkName(moved.move.from)} → ${networkName(moved.move.to)}`}
        >
          <div className="mt-4 mb-6 w-full">
            <CrosschainTimeline
              from={moved.move.from}
              to={moved.move.to}
              hash={moved.hash}
              english={en}
              onDelivered={refresh}
              delivery={
                moved.move.to === stellarId
                  ? () => stellarArrived(settings, session, moved.move.from, moved.hash)
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
          <MoneyPanel className="mb-2">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-[13px] text-text-muted">{en ? 'From' : 'Desde'}</span>
              {typeof available === 'bigint' && available > 0n ? (
                <button
                  type="button"
                  className="text-[12px] text-text-faint"
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
                ? 'It arrives in your same account. Circle charges a small fee, which you will see before confirming.'
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
                <NavigationLink href={localizedPath('/receive', en)} className="underline">
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
            (review.from === stellarId
              ? en
                ? ' The first time from Stellar you confirm twice: once to let Circle move your USDC.'
                : ' La primera vez desde Stellar confirmas dos veces: una para que Circle pueda mover tus USDC.'
              : '')
          }
          confirmLabel={en ? 'Confirm and move' : 'Confirmar y mover'}
          english={en}
          busy={busy}
          busyLabel={
            en
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
              settings={settings}
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
