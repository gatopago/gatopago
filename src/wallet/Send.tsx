'use client';

import { useState, type FormEvent } from 'react';
import { useAction } from './useAction';
import { useSearchParams } from 'next/navigation';
import { isAddress, isAddressEqual, parseUnits, type Address, type Hex } from 'viem';
import { BackHeader, MoneyPanel, TransactionActions } from '../consumer/Primitives';
import { AmountInput, SelectMenu } from '../consumer/SelectMenu';
import { RecipientShortcuts } from '../consumer/RecipientShortcuts';
import { TokenIcon } from '../consumer/TokenIcon';
import type { ClientSettings } from '../lib/settings';
import { networkName, publicClient, USDC_DECIMALS } from './account';
import { send } from './operations';
import { api, type Recipient } from './api';
import { formatAmount, formatBalance, formatHolding, formatUsdc, useBalances } from './balances';
import { ElsewhereNote } from '../consumer/ElsewhereNote';
import { checkStellarRecipient, planStellarSend, sendOnStellar, stellarArrived } from './stellar';
import { forgetCrossing, rememberCrossing } from './crossings';
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
import { assetBalance, walletAssets } from '@gatopago/shared/assets';
import { walletNetwork } from '@gatopago/shared/networks';
import { quoteSettlement, settlementAllowed, settlementCalls } from '@gatopago/shared/settlement';
import { payoutCalls } from '@gatopago/shared/rules';
import { TokenSelect } from '../consumer/TokenSelect';

/** A send: USDC (on its network or across through CCTP), or another coin on its own network. */
type Review = EvmReview | StellarReview;

/**
 * To a Stellar address: USDC from the Stellar account or burned on an EVM network (`calls`), or
 * XLM (`coin`), which never leaves Stellar.
 */
type StellarReview = Omit<Transfer, 'recipient'> & {
  stellar: true;
  recipient: string;
  label: string;
  calls: readonly { to: Address; data: Hex }[] | null;
  coin?: { symbol: 'XLM'; token: null; decimals: number };
  settle?: undefined;
};

type EvmReview = Transfer & {
  stellar?: undefined;
  label: string;
  /** Another coin on its own network: a token, or the network's native coin (`token: null`). */
  coin?: { symbol: string; token: Address | null; decimals: number };
  /** Settled through Agora Instant Settlement: what the recipient receives, quoted at a fixed price. */
  settle?: {
    symbol: string;
    token: Address;
    decimals: number;
    quote: bigint;
    allowListed: boolean;
    /** When it was prepared: the pair accepts the signature for ten minutes from then. */
    now: bigint;
  };
};

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
  const { balances, holding, stellar, stellarUsdc, refresh } = useBalances(settings, session);
  const stellarId = stellar ? settings.stellar!.network : null;
  // USDC, or another coin on its own network: a token (AUSD), a native coin (ETH, AVAX, MON) or,
  // with Stellar on, XLM.
  const others = walletAssets(settings.networks, settings.stellar?.network).filter(
    (asset) => asset.symbol !== 'USDC',
  );
  const [coin, setCoin] = useState('USDC');
  const chosen = others.find((asset) => asset.symbol === coin);
  const symbol = chosen?.symbol ?? 'USDC';
  // XLM goes only to Stellar addresses: never to a @username nor across networks.
  const xlm = !!chosen && chosen.holdings[0].networkId === settings.stellar?.network;
  // Where the coin's network has Agora Instant Settlement, the recipient may receive another coin.
  const settlementNetwork = chosen && !xlm ? walletNetwork(chosen.holdings[0].networkId) : null;
  // Agora converts tokens, not the network's own coin.
  const settleOptions =
    settlementNetwork?.instantSettlement && chosen!.holdings[0].token !== null
      ? (settlementNetwork.tokens ?? []).filter((token) => token.symbol !== chosen!.symbol)
      : [];
  const [receiveAs, setReceiveAs] = useState('');
  const settleInto = settleOptions.find((token) => token.symbol === receiveAs);
  // A scanned address may ask for its network: an EVM chain, or Stellar for a G…/C… address.
  const requestedNetwork =
    params.get('network') === 'stellar'
      ? (settings.stellar?.network ?? null)
      : params.get('chain')
        ? `eip155:${params.get('chain')}`
        : null;
  const initialNetwork =
    requestedNetwork &&
    (settings.networks.includes(requestedNetwork) || requestedNetwork === settings.stellar?.network)
      ? requestedNetwork
      : settings.homeNetwork;
  const scanned = reviewedRecipient(params, initialNetwork);
  const [destination, setDestination] = useState<'username' | 'address'>(
    scanned ? 'address' : 'username',
  );
  const [recipient, setRecipient] = useState(() => scanned || (params.get('username') ?? ''));
  const [networkId, setNetworkId] = useState(initialNetwork);
  // USDC available where it is sent from: the home network, or the network chosen for an address.
  const total = chosen
    ? assetBalance(chosen, holding)
    : networkId === stellarId
      ? stellarUsdc
      : balances[networkId];
  const decimals = chosen?.decimals ?? USDC_DECIMALS;
  // A balance is shown cut (it never shows more than there is); what is sent, exactly.
  const balanceText = (value: bigint, places: number) =>
    chosen ? formatHolding(value, places, en) : formatBalance(value, en);
  const [amount, setAmount] = useState('');
  const [review, setReview] = useState<Review | null>(null);
  const [sent, setSent] = useState<{ hash: string; review: Review } | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const { busy, error, run: perform } = useAction(en);

  function prepare(event: FormEvent) {
    event.preventDefault();
    perform(async () => {
      const value = parseUnits(amount.replace(',', '.'), decimals);
      if (value <= 0n) throw new Error('INVALID_AMOUNT');
      const text = recipient.trim();
      if (xlm) {
        await checkStellarRecipient(settings, text, 'XLM');
        if (text === stellar?.account) throw new Error('SELF_TRANSFER');
        if ((assetBalance(chosen!, holding) ?? 0n) < value) throw new Error('INSUFFICIENT_COIN');
        const network = settings.stellar!.network;
        setReview({
          stellar: true,
          from: network,
          to: network,
          recipient: text,
          amount: value,
          fee: 0n,
          label: text,
          calls: null,
          coin: { symbol: 'XLM', token: null, decimals },
        });
        return;
      }
      if (destination === 'address' && networkId === stellarId) {
        await checkStellarRecipient(settings, text);
        if (text === stellar!.account) throw new Error('SELF_TRANSFER');
        const plan = await planStellarSend(settings, balances, stellarUsdc, text, value);
        setReview({
          stellar: true,
          ...plan,
          to: stellarId,
          recipient: text,
          amount: value,
          label: text,
        });
        return;
      }
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
      if (chosen) {
        const held = chosen.holdings[0];
        if ((holding(held) ?? 0n) < value) throw new Error('INSUFFICIENT_COIN');
        const network = walletNetwork(held.networkId);
        const reader = publicClient(settings, held.networkId);
        const settle =
          settleInto && held.token
            ? {
                symbol: settleInto.symbol,
                token: settleInto.address,
                decimals: settleInto.decimals,
                quote: await quoteSettlement(reader, network, {
                  tokenIn: held.token,
                  tokenOut: settleInto.address,
                  amountIn: value,
                }),
                allowListed: await settlementAllowed(reader, network, session.wallet.address),
                now: BigInt(Math.floor(Date.now() / 1000)),
              }
            : undefined;
        setReview({
          from: held.networkId,
          to: held.networkId,
          recipient: to,
          amount: value,
          fee: 0n,
          label,
          coin: { symbol: chosen.symbol, token: held.token, decimals: chosen.decimals },
          settle,
        });
        return;
      }
      setReview({
        ...(await planTransfer(balances, networkId, to, value, destination === 'address')),
        label,
      });
    });
  }

  const callsFor = (current: Review) =>
    current.stellar
      ? (current.calls ?? [])
      : current.coin && current.settle
        ? settlementCalls(walletNetwork(current.from), {
            account: session.wallet.address,
            allowListed: current.settle.allowListed,
            tokenIn: current.coin.token!,
            tokenOut: current.settle.token,
            amountIn: current.amount,
            minOut: current.settle.quote,
            recipient: current.recipient,
            now: current.settle.now,
          })
        : current.coin?.token === null
          ? [{ to: current.recipient, data: '0x' as Hex, value: current.amount }]
          : current.coin
            ? payoutCalls(current.coin.token, [{ to: current.recipient, amount: current.amount }])
            : transferCalls(current);

  function confirm(current: Review) {
    perform(async () => {
      let hash: string;
      if (!current.stellar) hash = await send(settings, session, current.from, callsFor(current));
      else if (current.calls) {
        hash = await send(settings, session, current.from, current.calls);
        // Wallet Core delivers burns toward Stellar; the timeline reports it again if this is lost,
        // and Between networks follows it after a reload.
        void stellarArrived(settings, session, current.from, hash).catch(() => undefined);
        rememberCrossing(session.wallet.address, {
          from: current.from,
          to: current.to,
          amount: current.amount.toString(),
          hash,
        });
      } else
        hash = await sendOnStellar(
          settings,
          session,
          current.recipient,
          current.amount,
          current.coin ? 'XLM' : 'USDC',
        );
      setSent({ hash, review: current });
      setReceipt({
        kind: 'sent',
        amount: current.amount,
        currency: current.coin?.symbol ?? 'USDC',
        decimals: current.coin?.decimals ?? USDC_DECIMALS,
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
        label={
          busy && !review && !sent
            ? en
              ? 'Preparing your transfer…'
              : 'Preparando tu envío…'
            : null
        }
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
                onDelivered={() => forgetCrossing(session.wallet.address, sent.hash)}
                delivery={
                  sent.review.stellar
                    ? () => stellarArrived(settings, session, sent.review.from, sent.hash)
                    : undefined
                }
              />
            </div>
          ) : null}
          <NavigationLink href={localizedPath('/app', en)} className="btn btn-ghost btn-block mt-4">
            {en ? 'Go to home' : 'Ir al inicio'}
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
          <MoneyPanel className="mb-5 flex flex-col items-center">
            <AmountInput
              name="amount"
              aria-label={en ? `Amount in ${symbol}` : `Monto en ${symbol}`}
              placeholder="0"
              value={amount}
              disabled={busy}
              onChange={setAmount}
              className="amount-input tabular w-full max-w-[260px] bg-transparent text-center font-display leading-none text-text placeholder:text-text-faint"
            />
            {others.length > 0 ? (
              <div className="mt-3">
                <TokenSelect
                  value={symbol}
                  label={en ? 'Currency' : 'Moneda'}
                  options={[
                    { value: 'USDC', symbol: 'USDC', label: networkName(settings.homeNetwork) },
                    ...others.map((asset) => ({
                      value: asset.symbol,
                      symbol: asset.symbol,
                      label: networkName(asset.holdings[0].networkId),
                    })),
                  ]}
                  onChange={(value) => {
                    setCoin(value);
                    // XLM has no @username: it goes to a Stellar address.
                    if (
                      others.find((asset) => asset.symbol === value)?.holdings[0].networkId ===
                      settings.stellar?.network
                    ) {
                      setDestination('address');
                      setRecipient('');
                    }
                  }}
                  english={en}
                  disabled={busy}
                />
              </div>
            ) : (
              <span className="mt-3 inline-flex items-center gap-2 text-[13px] font-semibold">
                <TokenIcon symbol="USDC" size={22} />
                USDC
              </span>
            )}
            {settleOptions.length > 0 ? (
              <div className="mt-4 w-full max-w-[300px]">
                <p className="mb-2 text-center text-[12px] text-text-muted">
                  {en ? 'They receive' : 'Recibe en'}
                </p>
                <div className="seg-track seg-track-block">
                  {[chosen!.symbol, ...settleOptions.map((token) => token.symbol)].map((option) => (
                    <button
                      key={option}
                      type="button"
                      className="seg-item"
                      aria-pressed={(receiveAs || chosen!.symbol) === option}
                      data-active={(receiveAs || chosen!.symbol) === option}
                      disabled={busy}
                      onClick={() => setReceiveAs(option === chosen!.symbol ? '' : option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                {settleInto ? (
                  <p className="mt-2 text-center text-[11px] leading-snug text-text-faint">
                    {en
                      ? `Agora converts it at a fixed price and it arrives as ${settleInto.symbol} in seconds.`
                      : `Agora lo convierte a precio fijo y le llega en ${settleInto.symbol} en segundos.`}
                  </p>
                ) : null}
              </div>
            ) : null}
            <p className="mt-2 text-[12px] text-text-faint">
              {en ? 'Available' : 'Disponible'}:{' '}
              {typeof total === 'bigint' ? balanceText(total, decimals) : '—'} {symbol}
            </p>
            {chosen ? null : (
              <ElsewhereNote
                settings={settings}
                session={session}
                english={en}
                className="mt-1 text-center"
              />
            )}
          </MoneyPanel>
          <MoneyPanel className="mb-5">
            <p className="mb-3 text-[13px] font-semibold">{en ? 'To whom?' : '¿A quién?'}</p>
            {xlm ? null : (
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
                      // A GatoPago account receives on the home network.
                      if (type === 'username') setNetworkId(settings.homeNetwork);
                    }}
                  >
                    {type === 'address'
                      ? en
                        ? 'Address'
                        : 'Dirección'
                      : en
                        ? '@username'
                        : '@usuario'}
                  </button>
                ))}
              </div>
            )}
            <div className="relative">
              {destination === 'username' ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[15px] text-text-faint"
                >
                  @
                </span>
              ) : null}
              <input
                name="destination"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-label={destination === 'address' ? 'Wallet' : en ? 'Username' : 'Usuario'}
                placeholder={
                  destination === 'username'
                    ? en
                      ? 'username'
                      : 'usuario'
                    : xlm || networkId === stellarId
                      ? 'G… / C…'
                      : '0x…'
                }
                value={recipient}
                disabled={busy}
                onChange={(event) =>
                  setRecipient(
                    destination === 'username'
                      ? event.target.value.replace(/[^a-z0-9_]/gi, '').toLowerCase()
                      : event.target.value.trim(),
                  )
                }
                className={`meli-field h-12 text-[15px] placeholder:text-text-faint ${destination === 'address' ? 'font-mono text-[13px]' : '!pl-8'}`}
              />
            </div>
            {destination === 'username' ? (
              <RecipientShortcuts
                settings={settings}
                session={session}
                english={en}
                selected={[recipient]}
                onPick={setRecipient}
                className="mt-3"
              />
            ) : null}
            <p className="mt-3 text-[12px] leading-relaxed text-text-muted">
              {xlm
                ? en
                  ? 'A Stellar address (G… or C…). XLM is sent only within Stellar.'
                  : 'Una dirección de Stellar (G… o C…). XLM se envía solo dentro de Stellar.'
                : destination === 'username'
                  ? en
                    ? 'Their GatoPago username. It arrives instantly, with no fees.'
                    : 'Su usuario de GatoPago. Le llega al instante y sin comisión.'
                  : en
                    ? 'Paste the address and choose its network. For an exchange, make sure it accepts USDC on that network.'
                    : 'Pega la dirección y elige su red. Si es de un exchange, confirma que acepte USDC en esa red.'}
            </p>
            {destination === 'address' && !chosen ? (
              <SelectMenu
                label={en ? 'Network of the address' : 'Red de la dirección'}
                value={networkId}
                options={[...settings.networks, ...(stellarId ? [stellarId] : [])].map((id) => ({
                  value: id,
                  label: networkName(id),
                  network: id,
                }))}
                onChange={setNetworkId}
                english={en}
                disabled={busy}
                className="mt-4"
              />
            ) : null}
          </MoneyPanel>
          <TransactionActions>
            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={busy || !recipient || !(Number(amount) > 0)}
            >
              {busy
                ? en
                  ? 'Preparing…'
                  : 'Preparando…'
                : en
                  ? 'Review transfer'
                  : 'Revisar envío'}
            </button>
            {recipient && amount !== '' && !(Number(amount) > 0) ? (
              <p
                role="status"
                className="animate-fade-in mt-3 text-center text-[12px] text-text-faint"
              >
                {en ? 'Enter an amount above zero.' : 'Ingresa un monto mayor a cero.'}
              </p>
            ) : null}
          </TransactionActions>
        </form>
      )}
      {review ? (
        <ConfirmSheet
          title={en ? 'Confirm your send' : 'Confirma tu envío'}
          amountLabel={en ? 'You will send' : 'Vas a enviar'}
          amount={
            review.coin
              ? formatAmount(review.amount, review.coin.decimals, en, 2)
              : formatUsdc(review.amount, en)
          }
          unit={review.coin?.symbol ?? 'USDC'}
          warning={
            en
              ? 'Check who receives it: a transfer cannot be undone. GatoPago pays the network fee.'
              : 'Revisa quién lo recibe: un envío no se puede deshacer. GatoPago paga la comisión de red.'
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
              ...(review.settle
                ? ([
                    [
                      en ? 'They receive' : 'Recibe',
                      `${formatAmount(review.settle.quote, review.settle.decimals, en)} ${review.settle.symbol}`,
                    ],
                    [
                      en ? 'Price' : 'Precio',
                      en ? 'Fixed, no slippage (Agora)' : 'Fijo, sin deslizamiento (Agora)',
                    ],
                  ] as const)
                : []),
              [en ? 'Network' : 'Red', networkName(review.to)],
              ...(review.from !== review.to
                ? ([[en ? 'From' : 'Desde', networkName(review.from)]] as const)
                : []),
              ...(review.fee > 0n
                ? ([
                    [
                      en ? 'Circle transfer fee' : 'Comisión de Circle',
                      `${en ? 'up to' : 'hasta'} ${formatUsdc(review.fee, en)} USDC`,
                    ],
                  ] as const)
                : []),
            ]}
          />
          {review.stellar && !review.calls ? null : (
            <SigningDetails
              wallet={session.wallet}
              networkId={review.from}
              calls={callsFor(review)}
              english={en}
            />
          )}
        </ConfirmSheet>
      ) : null}
    </>
  );
}
