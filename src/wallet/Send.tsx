'use client';

import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  encodeFunctionData,
  erc20Abi,
  isAddress,
  isAddressEqual,
  parseUnits,
  type Address,
  type Hex,
} from 'viem';
import { walletNetwork } from '@gatopago/shared/networks';
import { BackHeader, Field, Panel } from '../consumer/Primitives';
import type { ClientSettings } from '../lib/settings';
import { explorerUrl, networkName, send, USDC_DECIMALS } from './account';
import { api, type Recipient } from './api';
import { formatUsdc, useBalances } from './Home';
import { failureMessage } from './messages';
import type { Session } from './session';

type Review = { to: Address; label: string; amount: bigint; networkId: string };

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
  const [recipient, setRecipient] = useState(
    () => params.get('recipient') ?? (params.get('username') ? `@${params.get('username')}` : ''),
  );
  const [networkId, setNetworkId] = useState(settings.networks[0]);
  const [amount, setAmount] = useState('');
  const [review, setReview] = useState<Review | null>(null);
  const [sent, setSent] = useState<{ hash: Hex; review: Review } | null>(null);
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
      if (value > (balances[networkId] ?? 0n)) throw new Error('INSUFFICIENT_FUNDS');
      const text = recipient.trim();
      let to: Address, label: string;
      if (isAddress(text)) {
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
      setReview({ to, label, amount: value, networkId });
    });
  }

  function confirm(current: Review) {
    perform(async () => {
      const hash = await send(settings, session, current.networkId, [
        {
          to: walletNetwork(current.networkId).usdc,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: 'transfer',
            args: [current.to, current.amount],
          }),
        },
      ]);
      setSent({ hash, review: current });
      setReview(null);
      refresh();
    });
  }

  return (
    <>
      <BackHeader title={en ? 'Send money' : 'Enviar dinero'} english={en} to="/move" />
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      {sent ? (
        <Panel>
          <h2 className="font-display text-xl">{en ? 'Sent' : 'Enviado'}</h2>
          <p className="my-3">
            ${formatUsdc(sent.review.amount)} USDC → {sent.review.label}
          </p>
          <p className="text-sm text-text-muted">{networkName(sent.review.networkId)}</p>
          {explorerUrl(sent.review.networkId, sent.hash) ? (
            <a
              className="auth-secondary btn btn-ghost btn-block"
              href={explorerUrl(sent.review.networkId, sent.hash)!}
              target="_blank"
              rel="noreferrer"
            >
              {en ? 'View receipt' : 'Ver comprobante'}
            </a>
          ) : null}
          <button
            type="button"
            className="auth-primary btn btn-primary btn-block"
            onClick={() => {
              setSent(null);
              setAmount('');
            }}
          >
            {en ? 'Send again' : 'Enviar otra vez'}
          </button>
        </Panel>
      ) : review ? (
        <Panel>
          <h2 className="font-display text-xl">{en ? 'Review' : 'Revisa'}</h2>
          <p className="my-3 font-display text-3xl">${formatUsdc(review.amount)} USDC</p>
          <p className="break-all">{review.label}</p>
          {review.label !== review.to ? (
            <p className="my-2 break-all font-mono text-xs text-text-muted">{review.to}</p>
          ) : null}
          <p className="mb-4 text-sm text-text-muted">
            {networkName(review.networkId)} · {en ? 'No fee' : 'Sin comisión'}
          </p>
          <button
            type="button"
            className="auth-primary btn btn-primary btn-block"
            disabled={busy}
            onClick={() => confirm(review)}
          >
            {busy
              ? en
                ? 'Sending…'
                : 'Enviando…'
              : en
                ? 'Confirm and send'
                : 'Confirmar y enviar'}
          </button>
          <button
            type="button"
            className="auth-secondary btn btn-ghost btn-block"
            disabled={busy}
            onClick={() => setReview(null)}
          >
            {en ? 'Edit' : 'Editar'}
          </button>
        </Panel>
      ) : (
        <Panel>
          <form onSubmit={prepare}>
            <Field label={en ? 'To (@username or address)' : 'Para (@usuario o dirección)'}>
              {(id) => (
                <input
                  id={id}
                  required
                  autoCapitalize="none"
                  spellCheck={false}
                  value={recipient}
                  disabled={busy}
                  onChange={(event) => setRecipient(event.target.value)}
                />
              )}
            </Field>
            <Field label={en ? 'Network' : 'Red'}>
              {(id) => (
                <select
                  id={id}
                  value={networkId}
                  disabled={busy}
                  onChange={(event) => setNetworkId(event.target.value)}
                >
                  {settings.networks.map((network) => (
                    <option key={network} value={network}>
                      {networkName(network)}
                      {typeof balances[network] === 'bigint'
                        ? ` · $${formatUsdc(balances[network])}`
                        : ''}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={en ? 'Amount (USDC)' : 'Monto (USDC)'}>
              {(id) => (
                <input
                  id={id}
                  required
                  inputMode="decimal"
                  pattern="[0-9]+([.,][0-9]{1,6})?"
                  value={amount}
                  disabled={busy}
                  onChange={(event) => setAmount(event.target.value)}
                />
              )}
            </Field>
            <button
              type="submit"
              className="auth-primary btn btn-primary btn-block"
              disabled={busy}
            >
              {busy ? (en ? 'Checking…' : 'Comprobando…') : en ? 'Review' : 'Revisar'}
            </button>
          </form>
        </Panel>
      )}
    </>
  );
}
