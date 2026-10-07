'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { isAddressEqual, parseUnits } from 'viem';
import { walletNetwork } from '@gatopago/shared/networks';
import { paymentCalls } from '@gatopago/shared/payments';
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
import { localizedPath } from '../consumer/routes';
import { SelectMenu } from '../consumer/SelectMenu';
import { ScreenLoading } from '../consumer/Skeleton';
import { StageOverlay } from '../consumer/StageOverlay';
import { TxResult } from '../consumer/TxResult';
import type { ClientSettings } from '../lib/settings';
import { networkName, USDC_DECIMALS } from './account';
import {
  payWithAccount,
  payWithBrowserWallet,
  planAccountPayment,
  readCheckout,
  type Intent,
  type Plan,
} from './flow';
import { formatBalance, formatUsdc, totalUsdc, useBalances } from './balances';
import { failureMessage } from './messages';
import { currentSession, subscribeSession, type Session } from './session';

/** `/pay/:id`: a GatoPago Flow payment request, as V2's payment page presented it. */
export function Checkout({
  id,
  settings,
  english: en,
}: {
  id: string;
  settings: ClientSettings;
  english: boolean;
}) {
  const session = useSyncExternalStore(subscribeSession, currentSession, () => undefined);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [error, setError] = useState('');
  // Whoever paid from this page sees their receipt, with or without a GatoPago account.
  const [paidHere, setPaidHere] = useState(false);

  useEffect(() => {
    readCheckout(settings, id)
      .then(setIntent)
      .catch((failure: unknown) => setError(failureMessage(failure, en)));
  }, [settings, id, en]);

  // A payment that crosses networks settles once Circle mints to the merchant: check every 5 s.
  const processing = intent?.status === 'processing';
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(() => void readCheckout(settings, id).then(setIntent), 5000);
    return () => clearInterval(timer);
  }, [processing, settings, id]);

  return (
    <ConsumerFrame english={en} presentation="public">
      <div className="auth-content">
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : !intent ? (
          <ScreenLoading kind="detail" english={en} />
        ) : (
          <Request
            intent={intent}
            settings={settings}
            session={session ?? null}
            english={en}
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
  intent.merchant?.name ??
  (intent.merchant
    ? `${intent.merchant.address.slice(0, 6)}…${intent.merchant.address.slice(-4)}`
    : '');

function Request({
  intent,
  settings,
  session,
  english: en,
  paidHere,
  onPaid,
}: {
  intent: Intent;
  settings: ClientSettings;
  session: Session | null;
  english: boolean;
  paidHere: boolean;
  onPaid: (intent: Intent) => void;
}) {
  const amount = parseUnits(intent.amount, USDC_DECIMALS);
  const merchant = merchantLabel(intent);
  const payment = intent.payment;
  const mine =
    paidHere ||
    (!!session && !!payment?.payer && isAddressEqual(payment.payer, session.wallet.address));
  const home = (
    <NavigationLink href={localizedPath('/app', en)} className="btn btn-ghost btn-block mt-4">
      {en ? 'Go to home' : 'Ir al inicio'}
    </NavigationLink>
  );

  if (intent.status === 'succeeded' && mine && payment?.transaction_hash)
    return (
      <ReceiptScreen
        english={en}
        receipt={{
          kind: 'paid',
          amount,
          currency: 'USDC',
          decimals: USDC_DECIMALS,
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
        lead={en ? 'Payment in progress' : 'Pago en proceso'}
        amount={formatUsdc(amount, en)}
        unit="USDC"
        body={
          en
            ? 'Confirming on the network. You can leave; the payment keeps going.'
            : 'Confirmando en la red. Puedes salir; el pago sigue su curso.'
        }
      >
        <div className="mt-4 w-full">
          <CrosschainTimeline
            from={payment.network}
            to={settings.homeNetwork}
            hash={payment.transaction_hash}
            english={en}
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
            ? en
              ? 'This request was already paid'
              : 'Este cobro ya fue pagado'
            : intent.status === 'canceled'
              ? en
                ? 'The merchant canceled this request'
                : 'El comercio canceló este cobro'
              : en
                ? 'This request expired'
                : 'Este cobro venció'
        }
        amount={formatUsdc(amount, en)}
        unit="USDC"
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
          {en ? `${merchant} requests a payment` : `${merchant} te cobra`}
        </h1>
      </div>
      <Pay intent={intent} settings={settings} session={session} english={en} onPaid={onPaid} />
    </>
  );
}

function Pay({
  intent,
  settings,
  session,
  english: en,
  onPaid,
}: {
  intent: Intent;
  settings: ClientSettings;
  session: Session | null;
  english: boolean;
  onPaid: (intent: Intent) => void;
}) {
  const [method, setMethod] = useState<'balance' | 'external'>(session ? 'balance' : 'external');
  const [hasWallet] = useState(() => typeof window !== 'undefined' && 'ethereum' in window);
  const amount = parseUnits(intent.amount, USDC_DECIMALS);
  // Signing in comes back to this payment.
  const signIn = localizedPath(
    `/login?next=${encodeURIComponent(`/pay/${intent.id}${en ? '?lang=en' : ''}`)}`,
    en,
  );
  return (
    <>
      <MoneyPanel className="mb-6 flex flex-col items-center text-center">
        <p className="tabular max-w-full break-words font-display text-[clamp(40px,13vw,56px)] leading-tight">
          {formatUsdc(amount, en)}
          <span className="ml-2 text-[0.42em] text-text-muted">USDC</span>
        </p>
        {intent.description ? (
          <p className="mt-1 text-[14px] leading-relaxed text-text-muted">{intent.description}</p>
        ) : null}
        {session ? <Balance settings={settings} session={session} english={en} /> : null}
      </MoneyPanel>
      {session ? (
        <div className="mb-2">
          <SectionLabel>{en ? 'Pay with' : '¿Con qué pagas?'}</SectionLabel>
          <div className="seg-track seg-track-block">
            {(['balance', 'external'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className="seg-item"
                data-active={method === value}
                aria-pressed={method === value}
                onClick={() => setMethod(value)}
              >
                {value === 'external'
                  ? en
                    ? 'Another wallet'
                    : 'Otra wallet'
                  : en
                    ? 'GatoPago balance'
                    : 'Saldo GatoPago'}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {session && method === 'balance' ? (
        <AccountPay
          intent={intent}
          settings={settings}
          session={session}
          english={en}
          onPaid={onPaid}
        />
      ) : session || hasWallet ? (
        <WalletPay
          intent={intent}
          settings={settings}
          english={en}
          hasWallet={hasWallet}
          onPaid={onPaid}
        />
      ) : (
        // No account here and no wallet in this browser: GatoPago first, the link for a wallet app.
        <TransactionActions>
          <NavigationLink href={signIn} className="btn btn-money btn-block">
            {en ? 'Pay with GatoPago' : 'Pagar con GatoPago'}
          </NavigationLink>
          <p className="mt-3 text-center text-[12px] leading-relaxed text-text-faint">
            {en
              ? 'Sign in with your fingerprint or face and come back here to pay. No account? You create it in a minute.'
              : 'Entras con tu huella o tu rostro y vuelves aquí para pagar. ¿Sin cuenta? La creas en un minuto.'}
          </p>
          <div className="mt-6 border-t border-border pt-5">
            <CopyCheckoutLink english={en} />
          </div>
        </TransactionActions>
      )}
      {!session && hasWallet ? (
        <NavigationLink href={signIn} className="btn-text mt-1 block w-full text-center">
          {en ? 'Have GatoPago? Pay with your balance' : '¿Tienes GatoPago? Paga con tu saldo'}
        </NavigationLink>
      ) : null}
    </>
  );
}

/** For a wallet app with its own browser: the link to open there. */
function CopyCheckoutLink({ english: en }: { english: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <p className="mb-3 text-center text-[13px] text-text-muted">
        {en
          ? 'Paying from another wallet? Open this link in its browser (MetaMask, Coinbase Wallet…).'
          : '¿Pagas desde otra wallet? Abre este link en su navegador (MetaMask, Coinbase Wallet…).'}
      </p>
      <button
        type="button"
        className="btn btn-ghost btn-block"
        onClick={() =>
          void navigator.clipboard?.writeText(location.href).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          })
        }
      >
        {copied ? (en ? 'Link copied ✓' : 'Link copiado ✓') : en ? 'Copy link' : 'Copiar link'}
      </button>
    </>
  );
}

function Balance({
  settings,
  session,
  english: en,
}: {
  settings: ClientSettings;
  session: Session;
  english: boolean;
}) {
  const { balances } = useBalances(settings, session);
  const total = totalUsdc(balances, settings.networks);
  if (typeof total !== 'bigint') return null;
  return (
    <p className="mt-3 text-[12px] text-text-faint">
      {en ? 'Your balance' : 'Tu saldo'}: {formatBalance(total, en)} USDC
    </p>
  );
}

function AccountPay({
  intent,
  settings,
  session,
  english: en,
  onPaid,
}: {
  intent: Intent;
  settings: ClientSettings;
  session: Session;
  english: boolean;
  onPaid: (intent: Intent) => void;
}) {
  const { balances, refresh } = useBalances(settings, session);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');

  function perform(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    action()
      .catch((failure: unknown) => setError(failureMessage(failure, en)))
      .finally(() => setBusy(false));
  }

  const amount = parseUnits(intent.amount, USDC_DECIMALS);
  return (
    <>
      <StageOverlay
        label={busy && !plan ? (en ? 'Preparing your payment…' : 'Preparando tu pago…') : null}
      />
      {error && !plan ? (
        <p role="alert" className="mb-4 text-center text-[13px] text-danger">
          {error}
        </p>
      ) : null}
      <TransactionActions
        hint={en ? 'GatoPago pays the network fee.' : 'GatoPago paga la comisión de red.'}
      >
        <button
          type="button"
          className="btn btn-money btn-block"
          disabled={busy || Object.keys(balances).length === 0}
          onClick={() =>
            perform(async () =>
              setPlan(await planAccountPayment(settings, session, intent, balances)),
            )
          }
        >
          {en ? 'Pay' : 'Pagar'}
        </button>
      </TransactionActions>
      {plan ? (
        <ConfirmSheet
          title={en ? 'Confirm your payment' : 'Confirma tu pago'}
          amountLabel={en ? 'You will send' : 'Vas a enviar'}
          amount={formatUsdc(plan.total, en)}
          unit="USDC"
          warning={
            en
              ? 'Check who you are paying: a payment cannot be undone. GatoPago pays the network fee.'
              : 'Revisa a quién le pagas: un pago no se puede deshacer. GatoPago paga la comisión de red.'
          }
          confirmLabel={en ? 'Confirm and pay' : 'Confirmar y pagar'}
          paymentAction
          english={en}
          busy={busy}
          busyLabel={en ? 'Confirm on your device…' : 'Confirma en tu dispositivo…'}
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
            <ConfirmDestination
              label={merchantLabel(intent)}
              address={intent.merchant.address}
              english={en}
            />
          ) : null}
          <ConfirmDetails
            rows={[
              [en ? 'From' : 'Desde', networkName(plan.network)],
              ...(plan.total > amount
                ? ([
                    [
                      en ? 'Fees, up to' : 'Comisiones, hasta',
                      `${formatUsdc(plan.total - amount, en)} USDC`,
                    ],
                  ] as const)
                : []),
            ]}
          />
          <SigningDetails
            settings={settings}
            wallet={session.wallet}
            networkId={plan.network}
            calls={paymentCalls(walletNetwork(plan.network), plan.payment, plan.signature)}
            english={en}
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
  english: en,
  hasWallet,
  onPaid,
}: {
  intent: Intent;
  settings: ClientSettings;
  english: boolean;
  hasWallet: boolean;
  onPaid: (intent: Intent) => void;
}) {
  const [network, setNetwork] = useState(settings.homeNetwork);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  if (!hasWallet)
    return (
      <div className="mt-6">
        <CopyCheckoutLink english={en} />
      </div>
    );
  return (
    <>
      <div className="mt-6 border-t border-border pt-5">
        <SectionLabel>{en ? 'Where is your USDC?' : '¿Dónde tienes USDC?'}</SectionLabel>
        <SelectMenu
          label={en ? 'Source network of the USDC' : 'Red de origen del USDC'}
          showLabel={false}
          value={network}
          options={settings.networks.map((id) => ({
            value: id,
            label: networkName(id),
            tone: 'info' as const,
          }))}
          onChange={setNetwork}
          english={en}
          disabled={busy}
        />
        <p className="mt-2 text-[12px] leading-relaxed text-text-faint">
          {en
            ? 'Choose where you already have USDC. GatoPago takes care of delivering it to the merchant.'
            : 'Elige dónde ya tienes USDC. GatoPago resuelve la entrega al comercio.'}
        </p>
      </div>
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
          {en ? 'Confirm the payment in your wallet…' : 'Confirma el pago en tu wallet…'}
        </p>
      ) : null}
      <TransactionActions
        hint={
          en
            ? "You don't need a GatoPago account. You pay directly from your wallet."
            : 'No necesitas una cuenta GatoPago. Pagas directamente desde tu wallet.'
        }
      >
        <button
          type="button"
          disabled={busy}
          className="btn btn-money btn-block"
          onClick={() => {
            setBusy(true);
            setError('');
            payWithBrowserWallet(settings, intent, network)
              .then(onPaid)
              .catch((failure: unknown) => setError(failureMessage(failure, en)))
              .finally(() => setBusy(false));
          }}
        >
          {en ? 'Connect wallet and pay' : 'Conectar wallet y pagar'}
        </button>
      </TransactionActions>
    </>
  );
}
