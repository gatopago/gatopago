'use client';

import { useEffect, useEffectEvent, useState, useSyncExternalStore } from 'react';
import { useAction } from './useAction';
import { isAddressEqual, parseUnits, type Address } from 'viem';
import { walletNetwork } from '@gatopago/shared/networks';
import { paymentCalls } from '@gatopago/shared/payments';
import { AddressQRCard } from '../consumer/AddressQRCard';
import { ConsumerFrame } from '../consumer/ConsumerFrame';
import { CrosschainTimeline } from '../consumer/CrosschainTimeline';
import { NavigationLink } from '../consumer/NavigationLink';
import {
  ConfirmDestination,
  ConfirmDetails,
  ConfirmSheet,
  ReceiptScreen,
  SigningDetails,
} from '../consumer/PaymentSheets';
import { MoneyPanel, SectionLabel, TransactionActions } from '../consumer/Primitives';
import { SelectMenu } from '../consumer/SelectMenu';
import { ScreenLoading } from '../consumer/Skeleton';
import { StageOverlay } from '../consumer/StageOverlay';
import { TxResult } from '../consumer/TxResult';
import type { ClientSettings } from '../lib/settings';
import { useCopy } from '../lib/useCopy';
import { networkName, shortAddress } from './account';
import {
  coinToken,
  intentDecimals,
  payableNetworks,
  payWithAccount,
  payWithBrowserWallet,
  planAccountPayment,
  readCheckout,
  type Intent,
  type Plan,
} from './flow';
import { formatAmount, formatBalance, formatHolding, useBalances } from './balances';
import { useFailureMessage } from './messages';
import { currentSession, subscribeSession, type Session } from './session';
import { useTranslations, useLocale } from 'next-intl';
import { SwapText } from '../consumer/SwapText';

/** `/pay/:id`: a GatoPago Flow payment request, as V2's payment page presented it. */
export function Checkout({ id, settings }: { id: string; settings: ClientSettings }) {
  const messageFor = useFailureMessage();
  const session = useSyncExternalStore(subscribeSession, currentSession, () => undefined);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [error, setError] = useState('');
  // Whoever paid from this page sees their receipt, with or without a GatoPago account.
  const [paidHere, setPaidHere] = useState(false);

  useEffect(() => {
    readCheckout(settings, id)
      .then(setIntent)
      .catch((failure: unknown) => setError(messageFor(failure)));
  }, [settings, id, messageFor]);

  // A payment that crosses networks settles once Circle mints to the merchant: check again 5 s
  // after each answer, while the page is visible. A failed check just waits for the next one;
  // leaving the page cancels the one in flight.
  const processing = intent?.status === 'processing';
  useEffect(() => {
    if (!processing) return;
    const leaving = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      if (!document.hidden)
        await readCheckout(settings, id, leaving.signal).then(setIntent, () => undefined);
      if (!leaving.signal.aborted) timer = setTimeout(check, 5000);
    };
    timer = setTimeout(check, 5000);
    return () => {
      leaving.abort();
      clearTimeout(timer);
    };
  }, [processing, settings, id]);

  return (
    <ConsumerFrame presentation="public">
      <div className="auth-content">
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : !intent ? (
          <ScreenLoading kind="detail" bar={false} />
        ) : (
          <Request
            intent={intent}
            settings={settings}
            session={session ?? null}
            paidHere={paidHere}
            onPaid={(paid) => {
              setPaidHere(true);
              setIntent(paid);
            }}
          />
        )}
      </div>
    </ConsumerFrame>
  );
}

const merchantLabel = (intent: Intent) =>
  intent.merchant?.name ?? (intent.merchant ? shortAddress(intent.merchant.address) : '');

function Request({
  intent,
  settings,
  session,
  paidHere,
  onPaid,
}: {
  intent: Intent;
  settings: ClientSettings;
  session: Session | null;
  paidHere: boolean;
  onPaid: (intent: Intent) => void;
}) {
  const locale = useLocale();
  const t = useTranslations('Checkout');
  const decimals = intentDecimals(intent);
  const amount = parseUnits(intent.amount, decimals);
  const merchant = merchantLabel(intent);
  const payment = intent.payment;
  const mine =
    paidHere ||
    (!!session && !!payment?.payer && isAddressEqual(payment.payer, session.wallet.address));
  const home = (
    <NavigationLink href={'/app'} className="btn btn-ghost btn-block mt-4">
      {t('goHome')}
    </NavigationLink>
  );

  if (intent.status === 'succeeded' && mine && payment?.transaction_hash)
    return (
      <ReceiptScreen
        receipt={{
          kind: 'paid',
          amount,
          currency: intent.currency,
          decimals,
          counterparty: merchant,
          reference: intent.description,
          hash: payment.transaction_hash,
          networkId: payment.network,
          date: (payment.paid_at ?? intent.created_at) * 1000,
        }}
      >
        {session ? home : null}
      </ReceiptScreen>
    );
  if (intent.status === 'processing' && payment?.transaction_hash)
    return (
      <TxResult
        state="pending"
        lead={t('paymentProgress')}
        amount={formatAmount(amount, decimals, locale, 2)}
        unit={intent.currency}
        body={t('confirmingNetworkLeavePayment')}
      >
        <div className="mt-4 w-full">
          <CrosschainTimeline
            from={payment.network}
            to={settings.homeNetwork}
            hash={payment.transaction_hash}
          />
        </div>
        {session ? home : null}
      </TxResult>
    );
  if (intent.status !== 'requires_payment')
    return (
      <TxResult
        state={intent.status === 'succeeded' ? 'success' : 'failed'}
        lead={
          intent.status === 'succeeded'
            ? mine
              ? t('paymentReceived')
              : t('requestAlreadyPaid')
            : intent.status === 'canceled'
              ? t('merchantCanceledRequest')
              : t('requestExpired')
        }
        amount={formatAmount(amount, decimals, locale, 2)}
        unit={intent.currency}
      >
        {intent.description ? (
          <p className="mt-3 text-[14px] text-text-muted">{intent.description}</p>
        ) : null}
      </TxResult>
    );

  return (
    <>
      <div className="mb-5 flex flex-col items-center gap-3 text-center">
        <div className="flex h-14 w-14 items-center justify-center border-2 border-text bg-cat-500 font-display text-[22px] uppercase text-on-cat shadow-[4px_4px_0_var(--color-cat-700)]">
          {merchant[0] ?? 'G'}
        </div>
        <h1 className="font-display text-[20px] leading-tight">
          {t('requestsPayment', { merchant })}
        </h1>
      </div>
      <Pay intent={intent} settings={settings} session={session} onPaid={onPaid} />
    </>
  );
}

function Pay({
  intent,
  settings,
  session,
  onPaid,
}: {
  intent: Intent;
  settings: ClientSettings;
  session: Session | null;
  onPaid: (intent: Intent) => void;
}) {
  const locale = useLocale();
  const t = useTranslations('Checkout');
  const methods = [
    ...(session ? (['balance'] as const) : []),
    'external' as const,
    ...(intent.deposit_address ? (['transfer'] as const) : []),
  ];
  const [method, setMethod] = useState<(typeof methods)[number]>(methods[0]);
  const [hasWallet] = useState(() => typeof window !== 'undefined' && 'ethereum' in window);
  const decimals = intentDecimals(intent);
  const amount = parseUnits(intent.amount, decimals);
  // Signing in comes back to this payment.
  const signIn = `/login?next=${encodeURIComponent(`/pay/${intent.id}`)}`;
  return (
    <>
      <MoneyPanel className="mb-6 flex flex-col items-center text-center">
        <p className="tabular max-w-full break-words font-display text-[clamp(40px,13vw,56px)] leading-tight">
          {formatAmount(amount, decimals, locale, 2)}
          <span className="ml-2 text-[0.42em] text-text-muted">{intent.currency}</span>
        </p>
        {intent.description ? (
          <p className="mt-1 text-[14px] leading-relaxed text-text-muted">{intent.description}</p>
        ) : null}
        {session ? <Balance intent={intent} settings={settings} session={session} /> : null}
      </MoneyPanel>
      {methods.length > 1 ? (
        <div className="mb-2">
          <SectionLabel>{t('payWith')}</SectionLabel>
          <div className="seg-track seg-track-block">
            {methods.map((value) => (
              <button
                key={value}
                type="button"
                className="seg-item"
                data-active={method === value}
                aria-pressed={method === value}
                onClick={() => setMethod(value)}
              >
                {value === 'balance'
                  ? t('gatopagoBalance')
                  : value === 'external'
                    ? t('anotherWallet')
                    : t('transfer')}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {method === 'transfer' && intent.deposit_address ? (
        <TransferPay
          intent={intent}
          address={intent.deposit_address}
          settings={settings}
          onPaid={onPaid}
        />
      ) : session && method === 'balance' ? (
        <AccountPay intent={intent} settings={settings} session={session} onPaid={onPaid} />
      ) : session || hasWallet ? (
        <WalletPay intent={intent} settings={settings} hasWallet={hasWallet} onPaid={onPaid} />
      ) : (
        // No account here and no wallet in this browser: GatoPago first, the link for a wallet app.
        <TransactionActions>
          <NavigationLink href={signIn} className="btn btn-money btn-block">
            {t('payGatopago')}
          </NavigationLink>
          <p className="mt-3 text-center text-[12px] leading-relaxed text-text-faint">
            {t('signFingerprintFaceCome')}
          </p>
          <div className="mt-6 border-t border-border pt-5">
            <CopyCheckoutLink />
          </div>
        </TransactionActions>
      )}
      {!session && hasWallet ? (
        <NavigationLink href={signIn} className="btn-text mt-1 block w-full text-center">
          {t('gatopagoPayBalance')}
        </NavigationLink>
      ) : null}
    </>
  );
}

/** For a wallet app with its own browser: the link to open there. */
function CopyCheckoutLink() {
  const t = useTranslations('Checkout');
  const { copy, label } = useCopy();
  return (
    <>
      <p className="mb-3 text-center text-[13px] text-text-muted">{t('payingAnotherWalletOpen')}</p>
      <button type="button" className="btn btn-ghost btn-block" onClick={() => copy(location.href)}>
        <SwapText>{label(t('copyLink'))}</SwapText>
      </button>
    </>
  );
}

/**
 * What the account holds of the intent's coin on `networkId`: USDC there, or the other coin on its
 * own network.
 */
function useCoinBalance(intent: Intent, settings: ClientSettings, session: Session) {
  const { balances, holding } = useBalances(settings, session);
  return (networkId: string) => {
    if (intent.currency === 'USDC') return balances[networkId];
    const token = coinToken(networkId, intent.currency);
    return token ? holding({ networkId, token }) : null;
  };
}

function Balance({
  intent,
  settings,
  session,
}: {
  intent: Intent;
  settings: ClientSettings;
  session: Session;
}) {
  const locale = useLocale();
  const t = useTranslations('Checkout');
  const balanceOn = useCoinBalance(intent, settings, session);
  // USDC lives on the home network, as everywhere in the app; another coin on its own network.
  // Nothing is said about other networks: a payment comes from one that covers it on its own
  // (`planAccountPayment`).
  const where =
    intent.currency === 'USDC' ? settings.homeNetwork : payableNetworks(settings, intent)[0];
  const available = where ? balanceOn(where) : null;
  if (typeof available !== 'bigint') return null;
  return (
    <p className="mt-3 text-[12px] text-text-faint">
      {t('balance')}:{' '}
      {intent.currency === 'USDC'
        ? formatBalance(available, locale)
        : formatHolding(available, intentDecimals(intent), locale)}{' '}
      {intent.currency}
    </p>
  );
}

function AccountPay({
  intent,
  settings,
  session,
  onPaid,
}: {
  intent: Intent;
  settings: ClientSettings;
  session: Session;
  onPaid: (intent: Intent) => void;
}) {
  const locale = useLocale();
  const t = useTranslations('Checkout');
  const { balances, refresh } = useBalances(settings, session);
  const balanceOn = useCoinBalance(intent, settings, session);
  const [plan, setPlan] = useState<Plan | null>(null);
  const { busy, error, run: perform } = useAction();

  const decimals = intentDecimals(intent);
  const amount = parseUnits(intent.amount, decimals);
  return (
    <>
      <StageOverlay label={busy && !plan ? t('preparingPayment') : null} />
      {error && !plan ? (
        <p role="alert" className="mb-4 text-center text-[13px] text-danger">
          {error}
        </p>
      ) : null}
      <TransactionActions hint={t('gatopagoPaysNetworkFee')}>
        <button
          type="button"
          className="btn btn-money btn-block"
          disabled={busy || Object.keys(balances).length === 0}
          onClick={() =>
            perform(async () =>
              setPlan(await planAccountPayment(settings, session, intent, balanceOn)),
            )
          }
        >
          {t('pay')}
        </button>
      </TransactionActions>
      {plan ? (
        <ConfirmSheet
          title={t('confirmPayment')}
          amountLabel={t('send')}
          amount={formatAmount(plan.total, decimals, locale, 2)}
          unit={intent.currency}
          warning={t('checkWhoPayingPayment')}
          confirmLabel={t('confirmPay')}
          paymentAction
          busy={busy}
          busyLabel={t('confirmDevice')}
          error={error}
          onConfirm={() =>
            perform(async () => {
              onPaid(await payWithAccount(settings, session, intent, plan));
              setPlan(null);
              refresh();
            })
          }
          onCancel={() => setPlan(null)}
        >
          {intent.merchant ? (
            <ConfirmDestination label={merchantLabel(intent)} address={intent.merchant.address} />
          ) : null}
          <ConfirmDetails
            rows={[
              [t('from'), networkName(plan.network)],
              ...(plan.total > amount
                ? ([
                    [
                      t('feesUp'),
                      `${formatAmount(plan.total - amount, decimals, locale, 2)} ${intent.currency}`,
                    ],
                  ] as const)
                : []),
            ]}
          />
          <SigningDetails
            wallet={session.wallet}
            networkId={plan.network}
            calls={paymentCalls(walletNetwork(plan.network), plan.payment, plan.signature)}
          />
        </ConfirmSheet>
      ) : null}
    </>
  );
}

/** Pays from a browser wallet: no GatoPago account needed. */
function WalletPay({
  intent,
  settings,
  hasWallet,
  onPaid,
}: {
  intent: Intent;
  settings: ClientSettings;
  hasWallet: boolean;
  onPaid: (intent: Intent) => void;
}) {
  const t = useTranslations('Checkout');
  const payable = payableNetworks(settings, intent);
  const [network, setNetwork] = useState(
    payable.includes(settings.homeNetwork) ? settings.homeNetwork : payable[0],
  );
  // One wallet prompt at a time: a double tap must not ask the wallet twice.
  const { busy, error, run } = useAction();
  if (!hasWallet)
    return (
      <div className="mt-6">
        <CopyCheckoutLink />
      </div>
    );
  return (
    <>
      {payable.length > 1 ? (
        <div className="mt-6 border-t border-border pt-5">
          <SectionLabel>{t('whereUsdc')}</SectionLabel>
          <SelectMenu
            label={t('sourceNetworkUsdc')}
            showLabel={false}
            value={network}
            options={payable.map((id) => ({
              value: id,
              label: networkName(id),
              network: id,
            }))}
            onChange={setNetwork}
            disabled={busy}
          />
          <p className="mt-2 text-[12px] leading-relaxed text-text-faint">
            {t('chooseWhereAlreadyUsdc')}
          </p>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 text-center text-[13px] leading-relaxed text-danger">
          {error}
        </p>
      ) : null}
      {busy ? (
        <p
          role="status"
          aria-live="polite"
          className="animate-pulse-soft mt-4 text-center text-[13px] text-text-muted"
        >
          {t('confirmPaymentWallet')}
        </p>
      ) : null}
      <TransactionActions hint={t('dontNeedGatopagoAccount')}>
        <button
          type="button"
          disabled={busy}
          className="btn btn-money btn-block"
          onClick={() =>
            void run(async () => onPaid(await payWithBrowserWallet(settings, intent, network)))
          }
        >
          {t('connectWalletPay')}
        </button>
      </TransactionActions>
    </>
  );
}

/**
 * Pays with a plain transfer to the intent's deposit address, from any wallet: the address is the
 * same on every network it can be paid on, and the QR asks for the amount on the one chosen. The
 * page reads the intent every 10 s while it is visible, and shows the payment once Flow sees it.
 */
function TransferPay({
  intent,
  address,
  settings,
  onPaid,
}: {
  intent: Intent;
  address: Address;
  settings: ClientSettings;
  onPaid: (intent: Intent) => void;
}) {
  const locale = useLocale();
  const t = useTranslations('Checkout');
  const payable = payableNetworks(settings, intent);
  const [network, setNetwork] = useState(
    payable.includes(settings.homeNetwork) ? settings.homeNetwork : payable[0],
  );
  const decimals = intentDecimals(intent);
  const amount = parseUnits(intent.amount, decimals);
  const { chain, usdc } = walletNetwork(network);
  const token = intent.currency === 'USDC' ? usdc : coinToken(network, intent.currency);
  // The page's callback changes with each render; the reads must not start over with it.
  const paid = useEffectEvent(onPaid);

  useEffect(() => {
    const leaving = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      if (!document.hidden) {
        const next = await readCheckout(settings, intent.id, leaving.signal).catch(() => null);
        if (next && next.status !== 'requires_payment') return paid(next);
      }
      if (!leaving.signal.aborted) timer = setTimeout(check, 10_000);
    };
    timer = setTimeout(check, 10_000);
    return () => {
      leaving.abort();
      clearTimeout(timer);
    };
  }, [settings, intent.id]);

  return (
    <div className="mt-6 border-t border-border pt-5">
      {payable.length > 1 ? (
        <div className="mb-5">
          <SectionLabel>{t('whereUsdc')}</SectionLabel>
          <SelectMenu
            label={t('sourceNetworkUsdc')}
            showLabel={false}
            value={network}
            options={payable.map((id) => ({ value: id, label: networkName(id), network: id }))}
            onChange={setNetwork}
          />
        </div>
      ) : null}
      <p className="mb-4 text-center text-[14px] leading-relaxed">
        {t('sendExactly', {
          amount: formatAmount(amount, decimals, locale, 2),
          currency: intent.currency,
          network: networkName(network),
        })}
      </p>
      <AddressQRCard
        address={address}
        chainId={chain.id}
        token={token}
        amount={amount}
        addressLabel={t('paymentAddress')}
      />
      <p className="mt-3 text-center text-[12px] leading-relaxed text-text-faint">
        {t('transferHint')}
      </p>
      <p
        role="status"
        aria-live="polite"
        className="animate-pulse-soft mt-4 text-center text-[13px] text-text-muted"
      >
        {t('waitingTransfer')}
      </p>
    </div>
  );
}
