'use client';

import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { formatUnits, parseUnits } from 'viem';
import type { ClientSettings } from '../lib/settings';
import { copyText } from '../lib/useCopy';
import { CatGlyph } from '../marketing/CatGlyph';
import { MeliSprite } from '../marketing/MeliSprite';
import { networkName, USDC_DECIMALS } from '../wallet/account';
import { formatUsdc } from '../wallet/balances';
import { createCharge, listCharges, type Intent } from '../wallet/flow';
import { useFailureMessage } from '../wallet/messages';
import { exactUnits, tooPrecise } from '../lib/amount';
import type { Session } from '../wallet/session';
import { useProfile } from '../wallet/useProfile';
import { downloadCard, shareCard } from './exportCard';
import { NavigationLink } from './NavigationLink';
import { Receipt } from './PaymentSheets';
import { BackHeader, MoneyPanel, SectionLabel, TransactionActions } from './Primitives';
import { AmountInput } from './NormalizedInput';
import { RowSkeletonList } from './Skeleton';
import { TokenIcon } from './TokenIcon';
import { useTranslations, useLocale } from 'next-intl';

/** What the result screen shows: a Flow charge, or the profile link for an open amount. */
type Link = { url: string; amount: bigint | null; description: string };

/**
 * `/charge`, V2's Create link: a fixed amount becomes a GatoPago Flow charge (`/pay/:id`); an open
 * amount shares the member's `@username` page, where the payer chooses how much.
 */
export function ChargeScreen({
  settings,
  session,
}: {
  settings: ClientSettings;
  session: Session;
}) {
  const messageFor = useFailureMessage();
  const locale = useLocale();
  const t = useTranslations('Charge');
  const { profile } = useProfile();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [link, setLink] = useState<Link | null>(null);
  const [charges, setCharges] = useState<Intent[] | null>(null);
  // The list could not be read: never shown as "no links", and the last one read stays.
  const [listFailed, setListFailed] = useState(false);
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
      .then((list) => {
        setCharges(list);
        setListFailed(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setListFailed(true);
      });
    return () => controller.abort();
  }, [settings, session, link, revision]);

  // Empty or zero asks the payer for the amount, on purpose; more than USDC's 6 decimals is a
  // mistake to fix, never an open link.
  const precise = !tooPrecise(amount, USDC_DECIMALS);
  const value =
    precise && /^(\d+\.?\d*|\.\d+)$/.test(amount) ? exactUnits(amount, USDC_DECIMALS) : 0n;
  const open = value === 0n && precise;
  const shareText = (url: string) => t('payMeGatopago', { url });

  function create() {
    setError('');
    if (!precise) return;
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
      .catch((failure: unknown) => setError(messageFor(failure)))
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
      setNotice(t('couldntExport'));
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
        <BackHeader title={t('paymentLink')} onBack={newCharge} />
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
                {formatUsdc(link.amount, locale)}
                <span className="ml-1.5 text-[18px] text-text-muted">USDC</span>
              </p>
            ) : (
              <p className="relative z-1 mb-2 font-display text-[24px] text-cat-300">
                {t('openAmount')}
              </p>
            )}
            {link.description ? (
              <p className="relative z-1 px-2 text-center text-[14px] leading-relaxed text-text-muted">
                {link.description}
              </p>
            ) : null}
            <p className="relative z-1 mt-5 text-[12px] text-text-faint">
              {t('paidUsdc', { homeNetwork: networkName(settings.homeNetwork) })}
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
                setNotice(t('linkCopied'));
              })
            }
          >
            {t('share')}
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
              {t('downloadQr')}
            </button>
            <button
              type="button"
              className="btn btn-ghost flex-1"
              onClick={() =>
                void copyText(link.url).then(
                  () => setNotice(t('linkCopied')),
                  () => setNotice(t('couldNotCopy')),
                )
              }
            >
              {t('copyLink')}
            </button>
          </div>
          {/* WhatsApp is where charges actually travel in LATAM: one tap, no share sheet. */}
          <a
            href={`https://wa.me/?text=${encodeURIComponent(shareText(link.url))}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-block mt-3"
          >
            {t('shareWhatsapp')}
          </a>
          <button type="button" className="btn-text mt-1 w-full" onClick={newCharge}>
            {t('createAnotherLink')}
          </button>
        </TransactionActions>
      </>
    );

  const visible = showAll ? (charges ?? []) : (charges ?? []).slice(0, 5);
  return (
    <>
      <BackHeader title={t('requestPayment')} to="/move?flow=receive" />
      <MoneyPanel className="mb-5 flex flex-col items-center">
        <p className="mb-3 text-[13px] text-text-muted">{t('howMuch')}</p>
        <AmountInput
          name="amount"
          aria-label={t('amountRequest')}
          placeholder="0"
          value={amount}
          onChange={setAmount}
          className="amount-input tabular w-full max-w-[260px] bg-transparent text-center font-display leading-none text-text placeholder:text-text-faint"
        />
        <span className="mt-3 inline-flex items-center gap-2 text-[13px] font-semibold">
          <TokenIcon symbol="USDC" size={22} />
          USDC
        </span>
        <p className="mt-3 text-center text-[12px] text-text-faint">{t('leave0PayerChooses')}</p>
      </MoneyPanel>
      <MoneyPanel className="mb-5">
        <label htmlFor="charge-reference" className="mb-2 block text-[13px] text-text-muted">
          {t('noteOptional')}
        </label>
        <textarea
          id="charge-reference"
          name="reference"
          placeholder={t('eGLogoDesign')}
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
      {!precise ? (
        <p role="alert" className="mb-4 text-center text-[13px] text-danger">
          {t('usdcDecimals')}
        </p>
      ) : null}
      {open && profile && !profile.username ? (
        <p className="mb-4 text-center text-[12px] text-text-muted">
          {t.rich('withoutAmountLinkUses', {
            link: (chunks) => (
              <NavigationLink href={'/profile'} className="underline">
                {chunks}
              </NavigationLink>
            ),
          })}
        </p>
      ) : null}
      <div className="pt-5">
        <button
          type="button"
          disabled={busy || !precise || (open && !profile?.username)}
          className="btn btn-primary btn-block"
          onClick={create}
        >
          {busy ? t('creating') : open ? t('createLinkWithoutAmount') : t('createPaymentLink')}
        </button>
      </div>

      {charges === null || charges.length > 0 || listFailed ? (
        <div className="mt-9">
          <SectionLabel>{t('paymentLinks')}</SectionLabel>
          {listFailed ? (
            <p role="alert" className="mb-3 text-[13px] leading-relaxed text-pending">
              {charges ? t('couldNotUpdateLinks') : t('couldNotLoadLinks')}{' '}
              <button
                type="button"
                onClick={() => {
                  setListFailed(false);
                  setRevision((current) => current + 1);
                }}
                className="-my-3 inline-block py-3 font-semibold text-cat-700 underline underline-offset-2"
              >
                {t('tryAgain')}
              </button>
            </p>
          ) : null}
          {charges === null ? (
            listFailed ? null : (
              <RowSkeletonList count={3} />
            )
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
                        {formatUsdc(parseUnits(intent.amount, USDC_DECIMALS), locale)} USDC
                      </p>
                      <p className="truncate text-[12px] text-text-faint">
                        {new Date(intent.created_at * 1000).toLocaleDateString(locale, {
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
                        ? t('paid')
                        : pending
                          ? t('pending')
                          : intent.status === 'canceled'
                            ? t('canceled')
                            : t('expired')}
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
              {showAll ? t('viewLess') : t('viewAll', { length: charges.length })}
            </button>
          ) : null}
        </div>
      ) : null}

      {paid?.payment?.transaction_hash ? (
        <Receipt
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
              href={`/team?${new URLSearchParams({ split: paid.amount, reference: paid.description ?? '' })}`}
              className="btn-text mt-2 w-full text-[#fff8f0]"
            >
              {t('splitPaymentAmongSeveral')}
            </NavigationLink>
          }
        />
      ) : null}
    </>
  );
}
