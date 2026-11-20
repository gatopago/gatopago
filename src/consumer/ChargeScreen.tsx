'use client';

import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { formatUnits, parseUnits } from 'viem';
import { walletAssets } from '@gatopago/shared/assets';
import type { ClientSettings } from '../lib/settings';
import { copyText } from '../lib/useCopy';
import { CatGlyph } from '../marketing/CatGlyph';
import { MeliSprite } from '../marketing/MeliSprite';
import { networkName } from '../wallet/account';
import { formatAmount } from '../wallet/balances';
import { createCharge, intentDecimals, listCharges, type Intent } from '../wallet/flow';
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
import { TokenSelect } from './TokenSelect';
import { useTranslations, useLocale } from 'next-intl';

/**
 * What the result screen shows: a Flow charge, or the profile link for an open amount, with the coin
 * it is paid in and the network that receives it.
 */
type Link = {
  url: string;
  amount: bigint | null;
  currency: string;
  decimals: number;
  network: string;
  description: string;
};

/**
 * `/charge`, V2's Create link: a fixed amount becomes a GatoPago Flow charge (`/pay/:id`), in USDC or
 * another coin of the networks (AUSD, paid and received on its own network); an open amount shares
 * the member's `@username` page, where the payer chooses how much in USDC.
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
  // USDC, or a coin of a network that is not a test token nor a network's own coin (AUSD).
  const coins = walletAssets(settings.networks).filter(
    (asset) =>
      asset.symbol === 'USDC' ||
      (!asset.test && asset.holdings.every(({ token }) => token !== null)),
  );
  const [symbol, setSymbol] = useState('USDC');
  const coin = coins.find((asset) => asset.symbol === symbol) ?? coins[0];
  const usdc = coin.symbol === 'USDC';
  // USDC is received on the home network; another coin, on its own.
  const receivesOn = usdc ? settings.homeNetwork : coin.holdings[0].networkId;
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

  // Empty or zero asks the payer for the amount, on purpose (in USDC, on the profile page); more
  // decimals than the coin has is a mistake to fix, never an open link.
  const precise = !tooPrecise(amount, coin.decimals);
  const value =
    precise && /^(\d+\.?\d*|\.\d+)$/.test(amount) ? exactUnits(amount, coin.decimals) : 0n;
  const open = value === 0n && precise && usdc;
  const linkFor = (url: string, linkAmount: bigint | null, text: string): Link => ({
    url,
    amount: linkAmount,
    currency: coin.symbol,
    decimals: coin.decimals,
    network: receivesOn,
    description: text,
  });
  const shareText = (url: string) => t('payMeGatopago', { url });

  function create() {
    setError('');
    if (!precise) return;
    if (open) {
      if (!profile?.username) return;
      setLink(linkFor(`${settings.webOrigin}/@${profile.username}`, null, description));
      return;
    }
    setBusy(true);
    const charge = {
      amount,
      currency: coin.symbol,
      ...(description.trim() ? { description: description.trim() } : {}),
    };
    const draft = JSON.stringify(charge);
    if (attempt.current?.draft !== draft) attempt.current = { draft, key: crypto.randomUUID() };
    createCharge(settings, session, charge, attempt.current.key)
      .then((intent) => {
        attempt.current = null;
        setLink(linkFor(intent.checkout_url, value, description.trim()));
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
    const decimals = intentDecimals(intent);
    setLink({
      url: intent.checkout_url,
      amount: parseUnits(intent.amount, decimals),
      currency: intent.currency,
      decimals,
      network:
        intent.currency === 'USDC'
          ? settings.homeNetwork
          : (coins.find((asset) => asset.symbol === intent.currency)?.holdings[0].networkId ??
            settings.homeNetwork),
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
                {formatAmount(link.amount, link.decimals, locale, 2)}
                <span className="ml-1.5 text-[18px] text-text-muted">{link.currency}</span>
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
              {t('paidIn', { symbol: link.currency, network: networkName(link.network) })}
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
                    `gatopago-cobro-${link.amount ? formatUnits(link.amount, link.decimals) : 'abierto'}-${link.currency}.png`,
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
        {coins.length > 1 ? (
          <div className="mt-3">
            <TokenSelect
              value={coin.symbol}
              label={t('currency')}
              options={coins.map((asset) => ({
                value: asset.symbol,
                symbol: asset.symbol,
                label:
                  asset.symbol === 'USDC' ? asset.name : networkName(asset.holdings[0].networkId),
              }))}
              onChange={setSymbol}
            />
          </div>
        ) : (
          <span className="mt-3 inline-flex items-center gap-2 text-[13px] font-semibold">
            <TokenIcon symbol="USDC" size={22} />
            USDC
          </span>
        )}
        {usdc ? (
          <p className="mt-3 text-center text-[12px] text-text-faint">{t('leave0PayerChooses')}</p>
        ) : null}
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
          {t('tooManyDecimals', { symbol: coin.symbol, decimals: coin.decimals })}
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
          disabled={busy || !precise || (value === 0n && !open) || (open && !profile?.username)}
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
                        {formatAmount(
                          parseUnits(intent.amount, intentDecimals(intent)),
                          intentDecimals(intent),
                          locale,
                          2,
                        )}{' '}
                        {intent.currency}
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
            amount: parseUnits(paid.amount, intentDecimals(paid)),
            currency: paid.currency,
            decimals: intentDecimals(paid),
            counterparty: paid.payment.payer,
            reference: paid.description,
            hash: paid.payment.transaction_hash,
            networkId: paid.payment.network,
            date: (paid.payment.paid_at ?? paid.created_at) * 1000,
          }}
          action={
            // Paying a team splits USDC from the home network.
            paid.currency !== 'USDC' ? undefined : (
              <NavigationLink
                href={`/team?${new URLSearchParams({ split: paid.amount, reference: paid.description ?? '' })}`}
                className="btn-text mt-2 w-full text-[#fff8f0]"
              >
                {t('splitPaymentAmongSeveral')}
              </NavigationLink>
            )
          }
        />
      ) : null}
    </>
  );
}
