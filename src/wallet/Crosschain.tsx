'use client';

import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAction } from './useAction';
import { formatUnits, type Address, type Hex } from 'viem';
import { exactUnits, tooPrecise } from '../lib/amount';
import { useFailureMessage } from './messages';
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
import { useTranslations, useLocale } from 'next-intl';

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
export function Crosschain({ settings, session }: { settings: ClientSettings; session: Session }) {
  const messageFor = useFailureMessage();
  const locale = useLocale();
  const t = useTranslations('Crosschain');
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
  const { busy, error, run: perform } = useAction();
  // From Stellar without Circle's permission: which of the two signatures is being asked.
  const [step, setStep] = useState<'allowance' | 'move' | null>(null);

  const precision = tooPrecise(amount, USDC_DECIMALS)
    ? messageFor(new Error('TOO_MANY_DECIMALS'))
    : '';
  const value =
    !precision && /^(\d+\.?\d*|\.\d+)$/.test(amount) ? exactUnits(amount, USDC_DECIMALS) : 0n;
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
      description:
        typeof balance === 'bigint' ? `${formatBalance(balance, locale)} USDC` : undefined,
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
      <BackHeader title={t('betweenNetworks')} to="/move" />
      <StageOverlay label={busy && !review && !moved ? t('preparingMove') : null} />
      {(error || precision) && !review ? (
        <p className="auth-error" role="alert">
          {error || precision}
        </p>
      ) : null}
      {moved ? (
        <TxResult
          state={moved.arrived ? 'success' : 'pending'}
          lead={moved.arrived ? t('arrived') : t('way')}
          amount={formatUsdc(BigInt(moved.amount), locale)}
          unit="USDC"
          body={`${networkName(moved.from)} → ${networkName(moved.to)}`}
        >
          <div className="mt-4 mb-6 w-full">
            <CrosschainTimeline
              from={moved.from}
              to={moved.to}
              hash={moved.hash}
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
          <NavigationLink
            href={localizedPath('/app', locale)}
            className="btn btn-primary btn-block"
          >
            {t('goHome')}
          </NavigationLink>
          <button type="button" className="btn-text mt-1 w-full" onClick={() => setMoved(null)}>
            {t('moveMore')}
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
                    {formatUsdc(BigInt(crossing.amount), locale)} USDC ·{' '}
                    {networkName(crossing.from)} → {networkName(crossing.to)}
                  </span>
                  <span className="shrink-0 text-pending">{t('waySee')}</span>
                </button>
              ))}
            </div>
          ) : null}
          <MoneyPanel className="mb-2">
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-[13px] text-text-muted">{t('from')}</span>
              {typeof available === 'bigint' && available > 0n ? (
                <button
                  type="button"
                  className="-my-3 py-3 text-[12px] text-text-faint"
                  disabled={locked}
                  onClick={() => setAmount(formatUnits(available, USDC_DECIMALS))}
                >
                  {t('balanceMoveAll', { available: formatBalance(available, locale) })}
                </button>
              ) : null}
            </div>
            <SelectMenu
              label={t('networkLeaves')}
              showLabel={false}
              value={from}
              options={networks}
              onChange={(id) => choose('from', id)}
              disabled={locked}
              className="mb-4"
            />
            <AmountInput
              name="amount"
              aria-label={t('amountUsdc')}
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
              aria-label={t('flipNetworks')}
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
            <span className="mb-3 block text-[13px] text-text-muted">{t('to')}</span>
            <SelectMenu
              label={t('networkArrives')}
              showLabel={false}
              value={to}
              options={networks}
              onChange={(id) => choose('to', id)}
              disabled={locked}
            />
            <p className="mt-3 text-[12px] leading-relaxed text-text-faint">
              {t('arrivesOwnAccountCircle')}
            </p>
          </MoneyPanel>

          {!enough ? (
            <p role="status" className="mb-4 text-center text-[13px] text-danger">
              {t('notEnoughBalanceNetwork')}
            </p>
          ) : null}

          <TransactionActions
            hint={
              <>
                {t.rich('receiveElsewhere', {
                  homeNetwork: networkName(settings.homeNetwork),
                  link: (chunks) => (
                    <NavigationLink
                      href={localizedPath('/receive', locale)}
                      className="-my-3 inline-block py-3 underline"
                    >
                      {chunks}
                    </NavigationLink>
                  ),
                })}
              </>
            }
          >
            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={busy || value <= 0n || !enough}
            >
              {busy ? t('checking') : t('reviewMove')}
            </button>
          </TransactionActions>
        </form>
      )}
      {review ? (
        <ConfirmSheet
          title={t('confirmMove')}
          amountLabel={t('move')}
          amount={formatUsdc(review.amount, locale)}
          unit="USDC"
          warning={review.allowance ? t('usdcLeavesWithPermission') : t('usdcLeavesNetworkCircle')}
          confirmLabel={t('confirmAndMove')}
          busy={busy}
          busyLabel={
            step === 'allowance'
              ? t('step12Confirm')
              : step === 'move' && review.allowance
                ? t('step22Confirm')
                : t('confirmDeviceMovingMoney')
          }
          error={error}
          onConfirm={() => confirm(review)}
          onCancel={() => setReview(null)}
        >
          <ConfirmDetails
            rows={[
              [t('from'), networkName(review.from)],
              [t('to'), networkName(review.to)],
              [t('circleTransferFee'), t('upTo', { fee: formatUsdc(review.fee, locale) })],
            ]}
          />
          {review.calls ? (
            <SigningDetails wallet={session.wallet} networkId={review.from} calls={review.calls} />
          ) : null}
        </ConfirmSheet>
      ) : null}
    </>
  );
}
