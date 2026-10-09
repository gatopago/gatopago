'use client';

import { copyText } from '../lib/clipboard';
import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { formatUnits, parseUnits } from 'viem';
import type { ClientSettings } from '../lib/settings';
import { CatGlyph } from '../marketing/CatGlyph';
import { MeliSprite } from '../marketing/MeliSprite';
import { networkName, USDC_DECIMALS } from '../wallet/account';
import { formatUsdc } from '../wallet/balances';
import { createCharge, listCharges, type Intent } from '../wallet/flow';
import { failureMessage } from '../wallet/messages';
import type { Session } from '../wallet/session';
import { useProfile } from '../wallet/useProfile';
import { downloadCard, shareCard } from './exportCard';
import { NavigationLink } from './NavigationLink';
import { Receipt } from './PaymentSheets';
import { BackHeader, MoneyPanel, SectionLabel, TransactionActions } from './Primitives';
import { localizedPath } from './routes';
import { AmountInput } from './SelectMenu';
import { RowSkeletonList } from './Skeleton';
import { TokenIcon } from './TokenIcon';

/** What the result screen shows: a Flow charge, or the profile link for an open amount. */
type Link = { url: string; amount: bigint | null; description: string };

/**
 * `/charge`, V2's Create link: a fixed amount becomes a GatoPago Flow charge (`/pay/:id`); an open
 * amount shares the member's `@username` page, where the payer chooses how much.
 */
export function ChargeScreen({
  settings,
  session,
  english: en,
}: {
  settings: ClientSettings;
  session: Session;
  english: boolean;
}) {
  const { profile } = useProfile();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [link, setLink] = useState<Link | null>(null);
  const [charges, setCharges] = useState<Intent[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [paid, setPaid] = useState<Intent | null>(null);
  const card = useRef<HTMLElement>(null);
  /** One idempotency key per charge being created, kept while retrying it. */
  const attempt = useRef<{ draft: string; key: string } | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (link) return;
    const controller = new AbortController();
    listCharges(settings, session, controller.signal)
      .then(setCharges)
      .catch(() => {
        if (!controller.signal.aborted) setCharges([]);
      });
    return () => controller.abort();
  }, [settings, session, link, revision]);

  const value = /^(\d+\.?\d{0,6}|\.\d{1,6})$/.test(amount) ? parseUnits(amount, USDC_DECIMALS) : 0n;
  const open = value === 0n;
  const shareText = (url: string) =>
    en ? `Pay me with GatoPago: ${url}` : `Págame con GatoPago: ${url}`;

  function create() {
    setError('');
    if (open) {
      if (!profile?.username) return;
      setLink({ url: `${settings.webOrigin}/@${profile.username}`, amount: null, description });
      return;
    }
    setBusy(true);
    const charge = {
      amount,
      ...(description.trim() ? { description: description.trim() } : {}),
    };
    const draft = JSON.stringify(charge);
    if (attempt.current?.draft !== draft) attempt.current = { draft, key: crypto.randomUUID() };
    createCharge(settings, session, charge, attempt.current.key)
      .then((intent) => {
        attempt.current = null;
        setLink({ url: intent.checkout_url, amount: value, description: description.trim() });
        setRevision((current) => current + 1);
      })
      .catch((failure: unknown) => setError(failureMessage(failure, en)))
      .finally(() => setBusy(false));
  }

  function reopen(intent: Intent) {
    if (intent.status === 'succeeded') {
      setPaid(intent);
      return;
    }
    setLink({
      url: intent.checkout_url,
      amount: parseUnits(intent.amount, USDC_DECIMALS),
      description: intent.description ?? '',
    });
  }

  async function exportLink(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setNotice('');
    try {
      await action();
    } catch {
      setNotice(en ? "Couldn't export" : 'No se pudo exportar');
    } finally {
      setBusy(false);
    }
  }

  function newCharge() {
    setLink(null);
    setAmount('');
    setDescription('');
    setNotice('');
  }

  if (link)
    return (
      <>
        <BackHeader
          title={en ? 'Your payment link' : 'Tu link de cobro'}
          english={en}
          onBack={newCharge}
        />
        <div className="flex flex-1 flex-col justify-center">
          <MoneyPanel
            ref={card}
            className="relative flex flex-col items-center overflow-hidden p-7"
          >
            <div className="receipt-rail absolute inset-x-0 top-0 h-1" aria-hidden="true" />
            <MeliSprite
              variant="head-peek"
              className="pointer-events-none absolute top-2 right-3 w-12 opacity-80"
            />
            <div className="relative z-1 mb-6 flex items-center gap-2">
              <CatGlyph className="w-6" decorative />
              <span className="font-display text-[16px]">GatoPago</span>
            </div>
            <div className="relative z-1 mb-6 border-2 border-text bg-white p-5 shadow-[6px_6px_0_var(--color-cat-700)]">
              <QRCodeSVG
                value={link.url}
                size={216}
                bgColor="#ffffff"
                fgColor="#0A0A0B"
                level="M"
              />
            </div>
            {link.amount ? (
              <p className="type-mono relative z-1 mb-2 text-[34px] font-bold leading-none">
                {formatUsdc(link.amount, en)}
                <span className="ml-1.5 text-[18px] text-text-muted">USDC</span>
              </p>
            ) : (
              <p className="relative z-1 mb-2 font-display text-[24px] text-cat-300">
                {en ? 'Open amount' : 'Monto abierto'}
              </p>
            )}
            {link.description ? (
              <p className="relative z-1 px-2 text-center text-[14px] leading-relaxed text-text-muted">
                {link.description}
              </p>
            ) : null}
            <p className="relative z-1 mt-5 text-[12px] text-text-faint">
              {en
                ? `Paid in USDC on ${networkName(settings.homeNetwork)}`
                : `Se paga en USDC por ${networkName(settings.homeNetwork)}`}
            </p>
          </MoneyPanel>
        </div>
        {notice ? (
          <p role="status" className="mt-4 text-center text-[12px] text-growth">
            {notice}
          </p>
        ) : null}
        <TransactionActions>
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={busy}
            aria-busy={busy}
            onClick={() =>
              void exportLink(async () => {
                const result = await shareCard(card.current, {
                  filename: 'gatopago-cobro.png',
                  text: shareText(link.url),
                  url: link.url,
                });
                if (result !== 'unsupported') return;
                await copyText(link.url);
                setNotice(en ? 'Link copied' : 'Link copiado');
              })
            }
          >
            {en ? 'Share' : 'Compartir'}
          </button>
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              className="btn btn-ghost flex-1"
              disabled={busy}
              aria-busy={busy}
              onClick={() =>
                void exportLink(() =>
                  downloadCard(
                    card.current,
                    `gatopago-cobro-${link.amount ? formatUnits(link.amount, USDC_DECIMALS) : 'abierto'}-USDC.png`,
                  ),
                )
              }
            >
              {en ? 'Download QR' : 'Descargar QR'}
            </button>
            <button
              type="button"
              className="btn btn-ghost flex-1"
              onClick={() =>
                void copyText(link.url).then(() => setNotice(en ? 'Link copied' : 'Link copiado'))
              }
            >
              {en ? 'Copy link' : 'Copiar link'}
            </button>
          </div>
          {/* WhatsApp is where charges actually travel in LATAM: one tap, no share sheet. */}
          <a
            href={`https://wa.me/?text=${encodeURIComponent(shareText(link.url))}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-block mt-3"
          >
            {en ? 'Share on WhatsApp' : 'Compartir por WhatsApp'}
          </a>
          <button type="button" className="btn-text mt-1 w-full" onClick={newCharge}>
            {en ? 'Create another link' : 'Crear otro link'}
          </button>
        </TransactionActions>
      </>
    );

  const visible = showAll ? (charges ?? []) : (charges ?? []).slice(0, 5);
  return (
    <>
      <BackHeader
        title={en ? 'Request a payment' : 'Cobrar'}
        english={en}
        to="/move?flow=receive"
      />
      <MoneyPanel className="mb-5 flex flex-col items-center">
        <p className="mb-3 text-[13px] text-text-muted">{en ? 'How much?' : '¿Cuánto cobras?'}</p>
        <AmountInput
          name="amount"
          aria-label={en ? 'Amount to request' : 'Monto a cobrar'}
          placeholder="0"
          value={amount}
          onChange={setAmount}
          className="amount-input tabular w-full max-w-[260px] bg-transparent text-center font-display leading-none text-text placeholder:text-text-faint"
        />
        <span className="mt-3 inline-flex items-center gap-2 text-[13px] font-semibold">
          <TokenIcon symbol="USDC" size={22} />
          USDC
        </span>
        <p className="mt-3 text-center text-[12px] text-text-faint">
          {en
            ? 'Leave it at 0 and the payer chooses the amount.'
            : 'Si lo dejas en 0, quien paga elige el monto.'}
        </p>
      </MoneyPanel>
      <MoneyPanel className="mb-5">
        <label htmlFor="charge-reference" className="mb-2 block text-[13px] text-text-muted">
          {en ? 'Note (optional)' : 'Concepto (opcional)'}
        </label>
        <textarea
          id="charge-reference"
          name="reference"
          placeholder={en ? 'E.g. Logo design' : 'Ej.: Diseño de logo'}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={200}
          rows={2}
          className="meli-field h-auto w-full resize-none py-3 text-[14px] placeholder:text-text-faint"
        />
      </MoneyPanel>
      {error ? (
        <p role="alert" className="mb-4 text-center text-[13px] text-danger">
          {error}
        </p>
      ) : null}
      {open && profile && !profile.username ? (
        <p className="mb-4 text-center text-[12px] text-text-muted">
          {en
            ? 'Without an amount, the link uses your username. '
            : 'Sin monto, el link usa tu usuario. '}
          <NavigationLink href={localizedPath('/profile', en)} className="underline">
            {en ? 'Choose it' : 'Elígelo'}
          </NavigationLink>
        </p>
      ) : null}
      <div className="pt-5">
        <button
          type="button"
          disabled={busy || (open && !profile?.username)}
          className="btn btn-primary btn-block"
          onClick={create}
        >
          {busy
            ? en
              ? 'Creating…'
              : 'Creando…'
            : en
              ? 'Create payment link'
              : 'Crear link de cobro'}
        </button>
      </div>

      {charges === null || charges.length > 0 ? (
        <div className="mt-9">
          <SectionLabel>{en ? 'Your payment links' : 'Tus links de cobro'}</SectionLabel>
          {charges === null ? (
            <RowSkeletonList count={3} />
          ) : (
            <div className="meli-paper-card meli-paper-card--strong divide-y divide-border overflow-hidden">
              {visible.map((intent) => {
                const settled = intent.status === 'succeeded';
                const pending =
                  intent.status === 'requires_payment' || intent.status === 'processing';
                return (
                  <button
                    key={intent.id}
                    type="button"
                    onClick={() => reopen(intent)}
                    disabled={!settled && !pending}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[14px]">
                        {formatUsdc(parseUnits(intent.amount, USDC_DECIMALS), en)} USDC
                      </p>
                      <p className="truncate text-[12px] text-text-faint">
                        {new Date(intent.created_at * 1000).toLocaleDateString(en ? 'en' : 'es', {
                          day: 'numeric',
                          month: 'short',
                        })}
                        {intent.description ? ` · ${intent.description}` : ''}
                      </p>
                    </div>
                    <span
                      className={`meli-chip shrink-0 ${settled ? 'bg-growth/15 text-growth' : pending ? 'bg-pending/10 text-pending' : 'bg-surface-2 text-text-faint'}`}
                    >
                      {settled
                        ? en
                          ? 'Paid'
                          : 'Pagado'
                        : pending
                          ? en
                            ? 'Pending'
                            : 'Pendiente'
                          : intent.status === 'canceled'
                            ? en
                              ? 'Canceled'
                              : 'Cancelado'
                            : en
                              ? 'Expired'
                              : 'Vencido'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {charges && charges.length > 5 ? (
            <button
              type="button"
              onClick={() => setShowAll((value) => !value)}
              className="btn-text mx-auto mt-3 block"
            >
              {showAll
                ? en
                  ? 'View less'
                  : 'Ver menos'
                : en
                  ? `View all (${charges.length})`
                  : `Ver todos (${charges.length})`}
            </button>
          ) : null}
        </div>
      ) : null}

      {paid?.payment?.transaction_hash ? (
        <Receipt
          english={en}
          onClose={() => setPaid(null)}
          receipt={{
            kind: 'received',
            amount: parseUnits(paid.amount, USDC_DECIMALS),
            currency: 'USDC',
            decimals: USDC_DECIMALS,
            counterparty: paid.payment.payer,
            reference: paid.description,
            hash: paid.payment.transaction_hash,
            networkId: paid.payment.network,
            date: (paid.payment.paid_at ?? paid.created_at) * 1000,
          }}
          action={
            <NavigationLink
              href={localizedPath(
                `/team?${new URLSearchParams({ split: paid.amount, reference: paid.description ?? '' })}`,
                en,
              )}
              className="btn-text mt-2 w-full text-[#fff8f0]"
            >
              {en ? 'Split this payment with my team' : 'Repartir este cobro con mi equipo'}
            </NavigationLink>
          }
        />
      ) : null}
    </>
  );
}
