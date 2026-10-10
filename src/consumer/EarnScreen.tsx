'use client';

import { useEffect, useState } from 'react';
import { formatUnits } from 'viem';
import { exactUnits, tooPrecise } from '../lib/amount';
import { useFailureMessage } from '../wallet/messages';
import { aavePoolAbi, depositCalls, supplyApy, withdrawCalls } from '@gatopago/shared/earn';
import { walletNetwork } from '@gatopago/shared/networks';
import type { ClientSettings } from '../lib/settings';
import { MeliSprite } from '../marketing/MeliSprite';
import { networkName, publicClient, USDC_DECIMALS } from '../wallet/account';
import { send } from '../wallet/operations';
import { formatBalance, formatUsdc, useBalances } from '../wallet/balances';
import { useAction } from '../wallet/useAction';
import type { Session } from '../wallet/session';
import { ElsewhereNote } from './ElsewhereNote';
import { ConfirmSheet, SigningDetails } from './PaymentSheets';
import { MoneyPanel, TabHeader } from './Primitives';
import { AmountInput } from './SelectMenu';
import { TxResult } from './TxResult';
import { useTranslations, useLocale } from 'next-intl';

type Action = 'deposit' | 'withdraw';
type Review = { action: Action; amount: bigint; all: boolean };

/** `/earn`, V2's Grow: USDC supplied to Aave V3 from the account on the home network. */
export function EarnScreen({ settings, session }: { settings: ClientSettings; session: Session }) {
  const messageFor = useFailureMessage();
  const locale = useLocale();
  const t = useTranslations('Earn');
  const networkId = settings.homeNetwork;
  const network = walletNetwork(networkId);
  const { balances, saved, refresh } = useBalances(settings, session);
  // `undefined` while reading it, `null` when Aave could not say.
  const [apy, setApy] = useState<number | null>();
  const [action, setAction] = useState<Action>('deposit');
  const [amount, setAmount] = useState('');
  const [all, setAll] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  // One deposit or withdrawal at a time, even with a double tap.
  const { busy, error, setError, run } = useAction();
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
      .catch(() => {
        if (active) setApy(null);
      });
    return () => {
      active = false;
    };
  }, [settings, networkId, network]);

  const available = balances[networkId];
  const savings = saved[networkId];
  const source = action === 'deposit' ? available : savings;
  const precision = tooPrecise(amount, USDC_DECIMALS)
    ? messageFor(new Error('TOO_MANY_DECIMALS'))
    : '';
  const value =
    !precision && /^(\d+\.?\d*|\.\d+)$/.test(amount) ? exactUnits(amount, USDC_DECIMALS) : 0n;
  const canContinue =
    typeof source === 'bigint' && source > 0n && (all || (value > 0n && value <= source));
  // While loading, a placeholder of the same size: the numbers arrive without moving the text.
  const shown = (balance: bigint | null | undefined) =>
    typeof balance === 'bigint' ? (
      formatBalance(balance, locale)
    ) : balance === undefined ? (
      <span
        className="skeleton inline-block h-[0.8em] w-[4.5em] align-baseline"
        aria-hidden="true"
      />
    ) : (
      '—'
    );
  const rate =
    typeof apy === 'number' ? apy.toLocaleString(locale, { maximumFractionDigits: 2 }) : null;

  if (!network.aave)
    return (
      <>
        <TabHeader title={t('grow')} />
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <MeliSprite variant="head-cautious" className="mb-5 w-24" />
          <p className="font-display text-[22px]">
            {t('growIsntAvailable', { networkId: networkName(networkId) })}
          </p>
        </div>
      </>
    );

  if (done)
    return (
      <>
        <TabHeader title={t('grow')} />
        <TxResult
          state="success"
          lead={done.action === 'deposit' ? t('depositComplete') : t('withdrawalComplete')}
          amount={formatUsdc(done.amount, locale)}
          unit="USDC"
          body={t('seeBalanceFewSeconds')}
        >
          <button
            type="button"
            className="btn btn-primary btn-block mt-6"
            onClick={() => setDone(null)}
          >
            {t('done')}
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
      <TabHeader title={t('grow')} description={t('earnInterestUsdcNot')} />

      <MoneyPanel className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
        <div className="min-w-0">
          <p className="mb-2 text-[13px] text-text-muted">{t('inGrow')}</p>
          <p className="type-mono text-[clamp(30px,9vw,38px)] font-bold leading-none">
            {shown(savings)} <span className="text-[0.5em]">USDC</span>
          </p>
          {rate ? (
            <p className="mt-3 inline-flex items-center gap-1.5 border border-growth bg-growth/10 px-2 py-1 text-[12px] font-semibold text-growth">
              {t('ratePerYear', { rate })}
              <span className="font-normal text-text-muted">· variable</span>
            </p>
          ) : apy === undefined ? (
            <span className="skeleton mt-3 block h-[26px] w-36" aria-hidden="true" />
          ) : null}
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
              {next === 'deposit' ? t('deposit') : t('withdraw')}
            </button>
          ))}
        </div>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[13px] text-text-muted">
            {action === 'deposit' ? t('available') : t('inGrow')}: {shown(source)} USDC
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
            {t('useAll')}
          </button>
        </div>
        <AmountInput
          name="amount"
          aria-label={t('amountUsdc')}
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
          <ElsewhereNote settings={settings} session={session} className="mb-3" />
        ) : null}
        {(error || precision) && !review ? (
          <p role="alert" className="mb-3 text-center text-[13px] text-danger">
            {error || precision}
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
            {action === 'deposit' ? t('reviewDeposit') : t('reviewWithdrawal')}
          </button>
        </div>
      </MoneyPanel>

      <details className="meli-paper-card meli-paper-card--strong px-4 py-3">
        <summary className="min-h-11 cursor-pointer py-3 text-[13px] text-text-muted">
          {t('howWorksRisks')}
        </summary>
        <dl className="grid gap-3 pt-4 text-[12px]">
          <div className="flex justify-between gap-4">
            <dt className="text-text-faint">{t('protocol')}</dt>
            <dd>Aave V3</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-faint">{t('network')}</dt>
            <dd>{networkName(networkId)}</dd>
          </div>
          <div>
            <dt className="mb-1 text-text-faint">{t('poolContract')}</dt>
            <dd className="break-all font-mono text-[11px]">{network.aave.pool}</dd>
            {network.chain.blockExplorers ? (
              <a
                className="mt-2 inline-block text-info"
                href={`${network.chain.blockExplorers.default.url}/address/${network.aave.pool}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('viewExplorer')} ↗
              </a>
            ) : null}
          </div>
        </dl>
        <p className="mt-5 mb-2 text-[12px] text-text-muted">{t('goodKnow')}</p>
        <ul className="flex list-disc flex-col gap-1 pb-2 pl-4 text-[12px] leading-relaxed text-text-faint">
          <li>{t('rateVariableNotGuaranteed')}</li>
          <li>{t('usdcLentThroughAave')}</li>
          <li>{t('withdrawAnytimeLongAave')}</li>
          <li>{t('moneyStillYoursGatopago')}</li>
        </ul>
      </details>

      {review ? (
        <ConfirmSheet
          title={review.action === 'deposit' ? t('confirmDeposit') : t('confirmWithdrawal')}
          amount={formatUsdc(review.amount, locale)}
          unit="USDC"
          confirmLabel={review.action === 'deposit' ? t('confirmDeposit') : t('confirmWithdrawal')}
          busy={busy}
          busyLabel={t('confirmDevice')}
          error={error}
          onCancel={() => setReview(null)}
          onConfirm={() =>
            void run(async () => {
              await send(settings, session, networkId, calls);
              setDone(review);
              setReview(null);
              setAmount('');
              setAll(false);
              refresh();
            })
          }
        >
          <p className="mb-3 text-center text-[13px] leading-relaxed text-text-muted">
            {review.action === 'deposit'
              ? t('movesBalanceGrowWhere')
              : review.all
                ? t('withdrawEverythingGrowInterest')
                : t('movesGrowBackBalance')}
          </p>
          {review.action === 'deposit' && rate ? (
            <p className="mb-5 text-center text-[12px] text-text-faint">
              {t('todaysRateYearVariable', { rate })}
            </p>
          ) : null}
          <SigningDetails wallet={session.wallet} networkId={networkId} calls={calls} />
        </ConfirmSheet>
      ) : null}
    </>
  );
}
