'use client';

import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { isAddress, isAddressEqual, parseUnits, type Address, type Hex } from 'viem';
import {
  BackHeader,
  MoneyPanel,
  OptionCard,
  SectionLabel,
  TransactionActions,
} from '../consumer/Primitives';
import { AmountInput, SelectMenu } from '../consumer/SelectMenu';
import { TokenSelect } from '../consumer/TokenSelect';
import { CatGlyph } from '../marketing/CatGlyph';
import type { ClientSettings } from '../lib/settings';
import { networkName, USDC_DECIMALS } from './account';
import { send } from './operations';
import { api, type Recipient } from './api';
import { formatUsdc, useBalances } from './balances';
import { failureMessage } from './messages';
import { reviewedRecipient } from '../consumer/qr';
import {
  ConfirmDestination,
  ConfirmDetails,
  ConfirmSheet,
  ReceiptScreen,
  SigningDetails,
  type ReceiptData,
} from '../consumer/PaymentSheets';
import { NavigationLink } from '../consumer/NavigationLink';
import { localizedPath } from '../consumer/routes';
import { CrosschainTimeline } from '../consumer/CrosschainTimeline';
import { StageOverlay } from '../consumer/StageOverlay';
import type { Session } from './session';
import { planTransfer, transferCalls, type Transfer } from './transfer';

type Review = Transfer & { label: string };

export function Send({
  settings,
  session,
  english: en,
}: {
  settings: ClientSettings;
  session: Session;
  english: boolean;
}) {
  const params = useSearchParams();
  const { balances, refresh } = useBalances(settings, session);
  const total = Object.values(balances).reduce<bigint>((sum, value) => sum + (value ?? 0n), 0n);
  const requestedNetwork = params.get('chain') ? `eip155:${params.get('chain')}` : null;
  const initialNetwork =
    requestedNetwork && settings.networks.includes(requestedNetwork)
      ? requestedNetwork
      : settings.homeNetwork;
  const scanned = reviewedRecipient(params, initialNetwork);
  const [destination, setDestination] = useState<'username' | 'address'>(
    scanned ? 'address' : 'username',
  );
  const [recipient, setRecipient] = useState(() => scanned || (params.get('username') ?? ''));
  const [networkId, setNetworkId] = useState(initialNetwork);
  const [amount, setAmount] = useState('');
  const [review, setReview] = useState<Review | null>(null);
  const [sent, setSent] = useState<{ hash: Hex; review: Review } | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
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
      if (value <= 0n) throw new Error('INVALID_AMOUNT');
      const text = recipient.trim();
      let to: Address, label: string;
      if (destination === 'address') {
        if (!isAddress(text)) throw new Error('INVALID_ADDRESS');
        to = text;
        label = text;
      } else {
        const found = await api<Recipient>(
          settings.apiOrigin,
          `recipients/${encodeURIComponent(text.replace(/^@/, '').toLowerCase())}`,
        );
        to = found.address;
        label = `@${found.username}${found.display_name ? ` · ${found.display_name}` : ''}`;
      }
      if (isAddressEqual(to, session.wallet.address)) throw new Error('SELF_TRANSFER');
      setReview({
        ...(await planTransfer(balances, networkId, to, value, destination === 'address')),
        label,
      });
    });
  }

  function confirm(current: Review) {
    perform(async () => {
      const hash = await send(settings, session, current.from, transferCalls(current));
      setSent({ hash, review: current });
      setReceipt({
        kind: 'sent',
        amount: current.amount,
        currency: 'USDC',
        decimals: USDC_DECIMALS,
        counterparty: current.label.split(' · ')[0],
        hash,
        networkId: current.from,
        date: Date.now(),
      });
      setReview(null);
      refresh();
    });
  }

  return (
    <>
      <BackHeader title={en ? 'Send money' : 'Enviar dinero'} english={en} to="/move" />
      <StageOverlay
        label={busy && !review ? (en ? 'Preparing your send…' : 'Preparando tu envío…') : null}
      />
      {error && !review ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      {sent && receipt ? (
        <ReceiptScreen
          receipt={receipt}
          english={en}
          note={
            sent.review.from !== sent.review.to
              ? en
                ? `Arrives on ${networkName(sent.review.to)} within minutes.`
                : `Llega a ${networkName(sent.review.to)} en unos minutos.`
              : undefined
          }
        >
          {sent.review.from !== sent.review.to ? (
            <div className="mt-6">
              <CrosschainTimeline
                from={sent.review.from}
                to={sent.review.to}
                hash={sent.hash}
                english={en}
              />
            </div>
          ) : null}
          <NavigationLink href={localizedPath('/app', en)} className="btn btn-ghost btn-block mt-4">
            {en ? 'Back to home' : 'Volver a Inicio'}
          </NavigationLink>
          <button
            type="button"
            className="btn-text mt-1 w-full"
            onClick={() => {
              setSent(null);
              setReceipt(null);
              setAmount('');
            }}
          >
            {en ? 'Send again' : 'Enviar otra vez'}
          </button>
        </ReceiptScreen>
      ) : (
        <form onSubmit={prepare} aria-busy={busy} className="flex flex-1 flex-col">
          <div className="mb-7 flex items-center justify-center gap-2">
            <CatGlyph className="w-6" decorative />
            <span className="text-[13px] text-text-muted">
              {en ? 'Secure payment with' : 'Pago seguro con'}{' '}
              <span className="font-medium text-text">GatoPago</span>
            </span>
          </div>
          <MoneyPanel className="mb-6 flex flex-col items-center">
            <AmountInput
              name="amount"
              aria-label={en ? 'Amount' : 'Monto'}
              placeholder="0"
              value={amount}
              disabled={busy}
              onChange={setAmount}
              className="tabular w-full max-w-[260px] bg-transparent text-center font-display text-[56px] leading-none text-text placeholder:text-text-faint"
            />
            <div className="mt-4">
              <TokenSelect
                value="USDC"
                options={[{ value: 'USDC', symbol: 'USDC', label: 'USD Coin' }]}
                onChange={() => {}}
                english={en}
              />
            </div>
            <p className="mt-3 text-[12px] text-text-faint">
              {en ? 'Your balance' : 'Tu saldo'}:{' '}
              {Object.keys(balances).length ? formatUsdc(total) : '—'} USDC
            </p>
          </MoneyPanel>
          <SelectMenu
            label={en ? 'Choose network' : 'Elegir red'}
            showLabel={false}
            value={networkId}
            options={settings.networks.map((id) => ({
              value: id,
              label: networkName(id),
              tone: 'info' as const,
            }))}
            onChange={setNetworkId}
            english={en}
            disabled={busy}
            className="mb-5"
          />
          <MoneyPanel className="mb-5">
            <div className="seg-track seg-track-block mb-4">
              {(['username', 'address'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  className="seg-item"
                  aria-pressed={destination === type}
                  data-active={destination === type}
                  onClick={() => {
                    setDestination(type);
                    setRecipient('');
                  }}
                >
                  {type === 'address'
                    ? en
                      ? 'Wallet or exchange'
                      : 'Wallet o exchange'
                    : en
                      ? 'GatoPago account'
                      : 'Cuenta GatoPago'}
                </button>
              ))}
            </div>
            <input
              name="destination"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-label={destination === 'address' ? 'Wallet' : en ? 'Username' : 'Usuario'}
              placeholder={destination === 'address' ? '0x…' : en ? 'theirname' : 'tunombre'}
              value={recipient}
              disabled={busy}
              onChange={(event) =>
                setRecipient(
                  destination === 'username'
                    ? event.target.value.replace(/[^a-z0-9_]/gi, '').toLowerCase()
                    : event.target.value.trim(),
                )
              }
              className={`meli-field h-12 text-[14px] placeholder:text-text-faint ${destination === 'address' ? 'font-mono' : ''}`}
            />
            <p className="mt-3 text-[12px] leading-relaxed text-text-muted">
              {destination === 'username'
                ? en
                  ? 'Send using their @username. The money will reach their GatoPago account.'
                  : 'Envía usando su @username. El dinero llegará a su cuenta GatoPago.'
                : en
                  ? `Send to any EVM address compatible with ${networkName(networkId)}, including a wallet or exchange deposit address.`
                  : `Envía a una dirección EVM compatible con ${networkName(networkId)}, incluida una wallet o dirección de depósito de un exchange.`}
            </p>
            {destination === 'address' ? (
              <div className="mt-4 flex items-center justify-between border border-border bg-surface-2 px-3.5 py-3 text-[12px]">
                <span className="text-text-faint">
                  {en ? 'Network for this transfer' : 'Red de este envío'}
                </span>
                <span className="text-text">{networkName(networkId)}</span>
              </div>
            ) : null}
          </MoneyPanel>
          <TransactionActions>
            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={busy || !recipient || !(Number(amount) > 0)}
            >
              {busy ? (en ? 'Looking up user…' : 'Buscando usuario…') : en ? 'Send' : 'Enviar'}
            </button>
            {recipient && amount !== '' && !(Number(amount) > 0) ? (
              <p
                role="status"
                className="animate-fade-in mt-3 text-center text-[12px] text-text-faint"
              >
                {en ? 'The amount must be greater than 0.' : 'El monto debe ser mayor a 0.'}
              </p>
            ) : null}
          </TransactionActions>
          <div className="mt-8">
            <SectionLabel>{en ? 'Other options' : 'Otras opciones'}</SectionLabel>
            <OptionCard
              href="/crosschain"
              english={en}
              tone="brand"
              title={en ? 'Send USDC to another network' : 'Enviar USDC a otra red'}
              description={
                en
                  ? 'Use CCTP to move it to another supported blockchain'
                  : 'Usa CCTP para moverlo a otra blockchain compatible'
              }
              icon={
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M7 17 17 7" />
                  <path d="M7 7h10v10" />
                </svg>
              }
            />
          </div>
        </form>
      )}
      {review ? (
        <ConfirmSheet
          title={en ? 'Confirm your send' : 'Confirma tu envío'}
          amountLabel={en ? 'You will send' : 'Vas a enviar'}
          amount={formatUsdc(review.amount)}
          unit="USDC"
          warning={
            en
              ? 'Check the destination carefully: payments cannot be undone. GatoPago covers gas; any other cost is shown before you confirm.'
              : 'Revisa bien el destino: los pagos no se pueden deshacer. GatoPago cubre el gas; cualquier otro costo se muestra antes de confirmar.'
          }
          confirmLabel={en ? 'Confirm and send' : 'Confirmar y enviar'}
          english={en}
          busy={busy}
          busyLabel={
            en
              ? 'Confirm on your device. Sending your money…'
              : 'Confirma en tu dispositivo. Enviando tu dinero…'
          }
          error={error}
          onConfirm={() => confirm(review)}
          onCancel={() => setReview(null)}
        >
          <ConfirmDestination
            label={review.label.split(' · ')[0]}
            address={review.recipient}
            english={en}
          />
          <ConfirmDetails
            rows={[
              [en ? 'Network' : 'Red', networkName(review.to)],
              ...(review.from !== review.to
                ? ([[en ? 'From' : 'Desde', networkName(review.from)]] as const)
                : []),
              ...(review.fee > 0n
                ? ([
                    [
                      en ? 'Circle transfer fee' : 'Comisión de Circle',
                      `${en ? 'up to' : 'hasta'} ${formatUsdc(review.fee)} USDC`,
                    ],
                  ] as const)
                : []),
            ]}
          />
          <SigningDetails
            settings={settings}
            wallet={session.wallet}
            networkId={review.from}
            calls={transferCalls(review)}
            english={en}
          />
        </ConfirmSheet>
      ) : null}
    </>
  );
}
