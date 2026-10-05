'use client';

import { useState, type FormEvent } from 'react';
import { parseUnits, type Hex } from 'viem';
import { crosschainCalls, crosschainFee } from '@gatopago/shared/crosschain';
import { walletNetwork } from '@gatopago/shared/networks';
import { NavigationLink } from '../consumer/NavigationLink';
import { BackHeader, Field, MoneyPanel } from '../consumer/Primitives';
import { CrosschainTimeline } from '../consumer/CrosschainTimeline';
import { ConfirmDetails, ConfirmSheet, SigningDetails } from '../consumer/PaymentSheets';
import { StageOverlay } from '../consumer/StageOverlay';
import { TxResult } from '../consumer/TxResult';
import { localizedPath } from '../consumer/routes';
import type { ClientSettings } from '../lib/settings';
import { MeliSprite } from '../marketing/MeliSprite';
import { networkName, send, USDC_DECIMALS } from './account';
import { formatUsdc, useBalances } from './balances';
import { failureMessage } from './messages';
import type { Session } from './session';

type Move = { from: string; to: string; amount: bigint; fee: bigint };

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
  const { balances, refresh } = useBalances(settings, session);
  const others = settings.networks.filter((id) => id !== settings.homeNetwork);
  const [from, setFrom] = useState(others[0] ?? settings.homeNetwork);
  const [to, setTo] = useState(settings.homeNetwork);
  const [amount, setAmount] = useState('');
  const [review, setReview] = useState<Move | null>(null);
  const [moved, setMoved] = useState<{ hash: Hex; move: Move } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');

  function perform(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    action()
      .catch((failure: unknown) => setError(failureMessage(failure, en)))
      .finally(() => setBusy(false));
  }

  function prepare(event: FormEvent) {
    event.preventDefault();
    perform(async () => {
      const value = parseUnits(amount.replace(',', '.'), USDC_DECIMALS);
      if (value <= 0n || from === to) throw new Error('INVALID_AMOUNT');
      if (value > (balances[from] ?? 0n)) throw new Error('INSUFFICIENT_FUNDS');
      const fee = await crosschainFee(walletNetwork(from), walletNetwork(to), value);
      if (fee >= value) throw new Error('CCTP_AMOUNT_BELOW_FEE');
      setReview({ from, to, amount: value, fee });
    });
  }

  const callsFor = (move: Move) =>
    crosschainCalls({
      from: walletNetwork(move.from),
      to: walletNetwork(move.to),
      amount: move.amount,
      recipient: session.wallet.address,
      maxFee: move.fee,
    });

  function confirm(move: Move) {
    perform(async () => {
      setMoved({ hash: await send(settings, session, move.from, callsFor(move)), move });
      setReview(null);
      setAmount('');
      refresh();
    });
  }

  const select = (value: string, onChange: (value: string) => void) => (id: string) => (
    <select
      id={id}
      className="meli-field"
      value={value}
      disabled={busy || review !== null}
      onChange={(event) => onChange(event.target.value)}
    >
      {settings.networks.map((network) => (
        <option key={network} value={network}>
          {networkName(network)}
          {typeof balances[network] === 'bigint' ? ` · ${formatUsdc(balances[network])} USDC` : ''}
        </option>
      ))}
    </select>
  );

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
          amount={formatUsdc(moved.move.amount)}
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
            />
          </div>
          <NavigationLink href={localizedPath('/app', en)} className="btn btn-primary btn-block">
            {en ? 'Back to home' : 'Volver a Inicio'}
          </NavigationLink>
          <button type="button" className="btn-text mt-1 w-full" onClick={() => setMoved(null)}>
            {en ? 'Move more' : 'Mover más'}
          </button>
        </TxResult>
      ) : (
        <MoneyPanel className="mb-6">
          <form onSubmit={prepare} aria-busy={busy}>
            <Field label={en ? 'From' : 'Desde'}>{select(from, setFrom)}</Field>
            <Field label={en ? 'To' : 'Hacia'}>{select(to, setTo)}</Field>
            <Field label={en ? 'Amount (USDC)' : 'Monto (USDC)'}>
              {(id) => (
                <input
                  id={id}
                  required
                  inputMode="decimal"
                  pattern="[0-9]+([.,][0-9]{1,6})?"
                  className="w-full border-0 bg-transparent py-2 font-mono text-[40px] font-semibold text-text outline-none placeholder:text-text-faint/40 focus-visible:ring-2 focus-visible:ring-cat-500"
                  placeholder="0.00"
                  value={amount}
                  disabled={busy || review !== null}
                  onChange={(event) => setAmount(event.target.value)}
                />
              )}
            </Field>
            {typeof balances[from] === 'bigint' && balances[from] > 0n ? (
              <button
                type="button"
                className="mb-4 min-h-11 text-[12px] text-info underline"
                disabled={busy || review !== null}
                onClick={() => setAmount(formatUsdc(balances[from]!).replaceAll(',', ''))}
              >
                {en ? 'Move everything' : 'Mover todo'}
              </button>
            ) : null}
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? (en ? 'Checking…' : 'Comprobando…') : en ? 'Review' : 'Revisar'}
            </button>
          </form>
        </MoneyPanel>
      )}
      {review ? (
        <ConfirmSheet
          title={en ? 'Confirm the move' : 'Confirma el movimiento'}
          amountLabel={en ? 'You will move' : 'Vas a mover'}
          amount={formatUsdc(review.amount)}
          unit="USDC"
          warning={
            en
              ? 'Your USDC leaves this network and Circle delivers it to your same account on the destination. GatoPago covers gas.'
              : 'Tus USDC salen de esta red y Circle los entrega en tu misma cuenta en el destino. GatoPago cubre el gas.'
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
                `${en ? 'up to' : 'hasta'} ${formatUsdc(review.fee)} USDC`,
              ],
            ]}
          />
          <SigningDetails
            settings={settings}
            wallet={session.wallet}
            networkId={review.from}
            calls={callsFor(review)}
            english={en}
          />
        </ConfirmSheet>
      ) : null}
      <div className="flex items-center gap-4">
        <MeliSprite variant="body-courier" className="w-20 shrink-0" />
        <p className="text-[12px] leading-relaxed text-text-muted">
          {en
            ? `Your balance lives on ${networkName(settings.homeNetwork)}. To receive from another network, share `
            : `Tu saldo vive en ${networkName(settings.homeNetwork)}. Para recibir desde otra red, comparte `}
          <NavigationLink href={localizedPath('/receive', en)} className="underline">
            {en ? 'your address' : 'tu dirección'}
          </NavigationLink>
          {en ? ': it is the same on every network.' : ': es la misma en todas las redes.'}
        </p>
      </div>
    </>
  );
}
