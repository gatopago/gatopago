'use client';

import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { formatUnits, keccak256, type Address, type Hex } from 'viem';
import { walletNetwork } from '@gatopago/shared/networks';
import { CatGlyph } from '../marketing/CatGlyph';
import { explorerUrl, gatopagoAccount, networkName } from '../wallet/account';
import type { ClientSettings } from '../lib/settings';
import type { Wallet } from '../wallet/session';
import { downloadCard, shareCard } from './exportCard';
import { Sheet } from './Sheet';
import { StageOverlay } from './StageOverlay';

/**
 * V2's one confirm-before-signing sheet: every operation that moves money confirms through this
 * surface. Detail rows go in `children`, between the amount and the trust line.
 */
export function ConfirmSheet({
  title,
  amountLabel,
  amount,
  unit,
  warning,
  confirmLabel,
  paymentAction = false,
  english: en,
  busy,
  busyLabel,
  error,
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  amountLabel?: string;
  amount: string;
  unit: string;
  warning?: string;
  confirmLabel: string;
  paymentAction?: boolean;
  english: boolean;
  busy: boolean;
  /** Shown full screen while the passkey prompt and the operation run. */
  busyLabel: string;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  return (
    <Sheet titleId="confirm-sheet-title" onClose={onCancel} busy={busy}>
      <div className="sheet-handle mb-5" aria-hidden="true" />
      <h2 id="confirm-sheet-title" className="meli-kicker mb-5">
        {title}
      </h2>
      <div className="mb-5 flex items-center gap-4 bg-[#0b0b0f] p-4 text-[#fff8f0]">
        <CatGlyph className="w-14 shrink-0" decorative />
        <div className="min-w-0">
          {amountLabel ? (
            <p className="mb-1 text-[11px] text-[rgb(255_248_240/.56)]">{amountLabel}</p>
          ) : null}
          <p className="type-mono max-w-full break-words text-[32px] font-bold leading-tight">
            {amount}
            <span className="ml-1.5 text-[15px] text-[rgb(255_248_240/.58)]">{unit}</span>
          </p>
        </div>
      </div>
      {children}
      <p className="mb-5 border-l-4 border-info bg-info/8 px-3 py-2 text-[12px] leading-relaxed text-text-muted">
        {warning ? `${warning} ` : null}
        {en
          ? 'You confirm it with your fingerprint, face or device PIN.'
          : 'Lo confirmas con tu huella, tu rostro o el PIN de tu dispositivo.'}
      </p>
      {error ? (
        <p className="auth-error mb-4" role="alert">
          {error}
        </p>
      ) : null}
      <StageOverlay label={busy ? busyLabel : null} spinner={false} />
      <button
        type="button"
        disabled={busy}
        onClick={onConfirm}
        className={`btn btn-block ${paymentAction ? 'btn-money' : 'btn-primary'}`}
      >
        {confirmLabel}
      </button>
      <button type="button" disabled={busy} data-sheet-close className="btn-text mt-1 w-full">
        {en ? 'Cancel' : 'Cancelar'}
      </button>
    </Sheet>
  );
}

/** Who receives, as V2's confirmation shows it: `@username` over its address, or the address. */
export function ConfirmDestination({
  label,
  address,
  english: en,
}: {
  label: string;
  address: string;
  english: boolean;
}) {
  return (
    <div className="mb-3 border border-border bg-surface px-4 py-3">
      <span className="mb-1 block text-[12px] text-text-muted">{en ? 'To' : 'Para'}</span>
      {label === address ? (
        <span className="break-all font-mono text-[13px] text-text">{address}</span>
      ) : (
        <span className="flex flex-col gap-1">
          <span className="text-[15px] text-text">{label}</span>
          <span className="break-all font-mono text-[11px] text-text-faint">{address}</span>
        </span>
      )}
    </div>
  );
}

/** V2's summary table inside a confirmation: network, origin, fees. */
export function ConfirmDetails({ rows }: { rows: (readonly [label: string, value: ReactNode])[] }) {
  return (
    <dl className="mb-4 border border-border text-[12px]">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex justify-between gap-4 border-b border-border p-3 last:border-b-0"
        >
          <dt className="text-text-muted">{label}</dt>
          <dd className="text-right font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SigningRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="border-b border-border py-2.5 last:border-0">
      <span className="mb-1 block text-[11px] text-text-faint">{label}</span>
      <span className={`break-all text-[12px] text-text ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

/**
 * V2's "signing details": what the passkey is about to authorize. The nonce and the final digest
 * are only fixed when the operation is signed, so they are not shown here.
 */
export function SigningDetails({
  settings,
  wallet,
  networkId,
  calls,
  english: en,
}: {
  settings: ClientSettings;
  wallet: Wallet;
  networkId: string;
  calls: readonly { to: Address; data: Hex; value?: bigint }[];
  english: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState<{ entryPoint: Address; action: Hex } | null>(null);
  useEffect(() => {
    if (!open || details) return;
    let active = true;
    void gatopagoAccount(settings, wallet, networkId)
      .then(async (account) => ({
        entryPoint: account.entryPoint.address,
        action: keccak256(await account.encodeCalls(calls)),
      }))
      .then((value) => {
        if (active) setDetails(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [open, details, settings, wallet, networkId, calls]);
  const { chain } = walletNetwork(networkId);
  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="interactive-surface flex h-11 w-full items-center justify-between gap-3 border border-border bg-surface px-3.5 text-left"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center border border-cat-300 bg-cat-500/12 text-cat-300"
            aria-hidden="true"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </span>
          <span className="truncate text-[13px] text-text-muted">
            {open
              ? en
                ? 'Hide technical details'
                : 'Ocultar detalles técnicos'
              : en
                ? 'What am I signing?'
                : '¿Qué estoy firmando?'}
          </span>
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 text-text-faint transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div className="animate-fade-in mt-2 border border-border bg-surface px-3.5">
          <p className="pt-3 pb-1 text-[11px] leading-relaxed text-cat-300">
            {en
              ? 'Your passkey signs exactly this operation, with the EIP-712 standard. Nobody else can authorize it.'
              : 'Tu llave firma exactamente esta operación, con el estándar EIP-712. Nadie más puede autorizarla.'}
          </p>
          <SigningRow label={en ? 'Standard' : 'Estándar'} value="EIP-712 · ERC-4337" />
          <SigningRow label={en ? 'Network' : 'Red'} value={`${chain.name} · ${chain.id}`} />
          <SigningRow
            label={en ? 'Authorizing account' : 'Cuenta que autoriza'}
            value={wallet.address}
            mono
          />
          <SigningRow
            label={en ? 'Verifying contract' : 'Contrato verificador'}
            value={details?.entryPoint ?? '…'}
            mono
          />
          <SigningRow
            label={en ? 'Action fingerprint' : 'Huella de la acción'}
            value={details?.action ?? '…'}
            mono
          />
        </div>
      ) : null}
    </div>
  );
}

/** A movement as V2's receipt shows it. */
export interface ReceiptData {
  /** `paid` is a payment to a merchant; `sent`, a transfer. */
  kind: 'sent' | 'paid' | 'received' | 'swapped';
  /** Atomic units of `currency`. */
  amount: bigint;
  currency: string;
  decimals: number;
  /** `@username` or an address; addresses are shortened. */
  counterparty?: string | null;
  reference?: string | null;
  /** A transaction hash: `0x…` on EVM networks, bare hex on Stellar. */
  hash?: string | null;
  networkId?: string | null;
  /** Milliseconds since the epoch. */
  date: number;
}

const HIDE_BALANCE_KEY = 'gatopago:hideBalance';

/** Home's "hide balance" choice; receipts opened from the account keep amounts masked too. */
export function balanceHidden() {
  try {
    return localStorage.getItem(HIDE_BALANCE_KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberBalanceHidden(hidden: boolean) {
  try {
    localStorage.setItem(HIDE_BALANCE_KEY, hidden ? '1' : '0');
  } catch {
    // Private mode: the choice lasts for this visit only.
  }
}

const short = (value: string) =>
  value.startsWith('0x') ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;

const receiptAmount = (receipt: ReceiptData, en: boolean) =>
  Number(formatUnits(receipt.amount, receipt.decimals)).toLocaleString(en ? 'en' : 'es', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });

const receiptFile = (receipt: ReceiptData) =>
  `gatopago-${formatUnits(receipt.amount, receipt.decimals)}-${receipt.currency}.png`;

/** V2's receipt paper (the one with the check), the node exported as an image. */
function ReceiptCard({
  receipt,
  english: en,
  hidden = false,
  note,
  ref,
}: {
  receipt: ReceiptData;
  english: boolean;
  hidden?: boolean;
  /** Extra line under the counterparty, such as when a cross-network send arrives. */
  note?: string;
  ref: Ref<HTMLDivElement>;
}) {
  const received = receipt.kind === 'received';
  const date = new Date(receipt.date);
  const url =
    receipt.hash && receipt.networkId ? explorerUrl(receipt.networkId, receipt.hash) : null;
  return (
    <div
      ref={ref}
      className="receipt-paper animate-pixel-in relative flex w-full flex-col items-center overflow-hidden p-8"
    >
      <div className="receipt-rail absolute inset-x-0 top-0 h-2" aria-hidden="true" />
      <div className="relative z-1 mb-6 flex items-center gap-2">
        <CatGlyph className="w-6" decorative />
        <span className="font-display text-[16px] text-paper-text">GatoPago</span>
      </div>
      <div className="relative z-1 mb-5 flex h-14 w-14 items-center justify-center border-2 border-paper-text bg-growth/25 text-paper-text">
        <svg
          aria-hidden="true"
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <p id="receipt-title" className="relative z-1 mb-1 text-[14px] text-paper-muted">
        {receipt.kind === 'swapped'
          ? en
            ? 'You swapped'
            : 'Cambiaste'
          : received
            ? en
              ? 'You received'
              : 'Recibiste'
            : receipt.kind === 'paid'
              ? en
                ? 'You paid'
                : 'Pagaste'
              : en
                ? 'You sent'
                : 'Enviaste'}
      </p>
      <p className="type-mono relative z-1 mb-4 max-w-full break-words text-center text-[40px] font-bold leading-tight text-paper-text">
        {hidden ? (
          '••••'
        ) : (
          <>
            {received ? '+' : '−'}
            {receiptAmount(receipt, en)}
            <span className="ml-1.5 text-[20px] text-paper-muted">{receipt.currency}</span>
          </>
        )}
      </p>
      {receipt.counterparty ? (
        <div className="relative z-1 mb-1 flex items-center justify-center gap-2">
          <span className="text-[11px] uppercase tracking-[0.08em] text-paper-muted">
            {received ? (en ? 'From' : 'De') : en ? 'To' : 'Para'}
          </span>
          <span className="border border-paper-border bg-paper-2 px-2.5 py-0.5 font-mono text-[13px] text-paper-muted">
            {short(receipt.counterparty)}
          </span>
        </div>
      ) : null}
      {receipt.reference ? (
        <p className="relative z-1 mb-1 text-center text-[14px] text-paper-muted">
          {receipt.reference}
        </p>
      ) : null}
      {note ? (
        <p className="relative z-1 mt-1 text-center text-[12px] text-paper-muted">{note}</p>
      ) : null}
      <div className="relative z-1 mt-5 flex w-full flex-col gap-1.5 border border-paper-border bg-paper-2 px-4 py-3">
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-paper-muted">{en ? 'Date' : 'Fecha'}</span>
          <span className="text-paper-text">
            {date.toLocaleDateString(en ? 'en' : 'es', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </span>
        </div>
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-paper-muted">{en ? 'Time' : 'Hora'}</span>
          <span className="text-paper-text">
            {date.toLocaleTimeString(en ? 'en' : 'es', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        {receipt.hash ? (
          <div className="flex items-center justify-between gap-3 text-[12px]">
            <span className="shrink-0 text-paper-muted">
              {en ? 'Receipt no.' : 'N° de comprobante'}
            </span>
            <span className="truncate font-mono text-paper-text">
              {`${receipt.hash.slice(0, 10)}…${receipt.hash.slice(-8)}`}
            </span>
          </div>
        ) : null}
        {receipt.networkId ? (
          <div className="flex items-center justify-between gap-3 text-[12px]">
            <span className="shrink-0 text-paper-muted">{en ? 'Network' : 'Red'}</span>
            <span className="text-right text-paper-text">{networkName(receipt.networkId)}</span>
          </div>
        ) : null}
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 text-center text-[12px] font-semibold text-cat-700 underline underline-offset-2"
          >
            {en ? 'See it on the blockchain ↗' : 'Verlo en la blockchain ↗'}
          </a>
        ) : null}
        <p className="mt-1 text-center text-[11px] text-paper-muted">
          GatoPago · {en ? 'Receipt' : 'Comprobante'}
        </p>
      </div>
    </div>
  );
}

const downloadFailed = (en: boolean) =>
  en ? "Couldn't download the receipt" : 'No se pudo descargar el comprobante';

function useReceiptExport(en: boolean) {
  const pending = useRef(false);
  const [state, setState] = useState({ busy: false, error: '' });
  async function perform(action: () => Promise<unknown>) {
    if (pending.current) return;
    pending.current = true;
    setState({ busy: true, error: '' });
    let error = '';
    try {
      await action();
    } catch {
      error = downloadFailed(en);
    } finally {
      pending.current = false;
      setState({ busy: false, error });
    }
  }
  return { ...state, perform };
}

/** The receipt of a movement, opened from the account (Home, Activity). */
export function Receipt({
  receipt,
  english: en,
  onClose,
  action,
}: {
  receipt: ReceiptData;
  english: boolean;
  onClose: () => void;
  /** What to do next with this money (e.g. split a paid charge). */
  action?: ReactNode;
}) {
  const card = useRef<HTMLDivElement>(null);
  const [hidden] = useState(balanceHidden);
  const { busy, error, perform } = useReceiptExport(en);
  return (
    <Sheet titleId="receipt-title" onClose={onClose} variant="receipt">
      <ReceiptCard ref={card} receipt={receipt} english={en} hidden={hidden} />
      <div className="mt-4 flex w-full gap-3">
        <button
          type="button"
          className="btn btn-primary min-w-0 flex-1"
          disabled={busy}
          aria-busy={busy}
          onClick={() => void perform(() => downloadCard(card.current, receiptFile(receipt)))}
        >
          {en ? 'Download receipt' : 'Descargar comprobante'}
        </button>
        <button type="button" className="btn btn-ghost shrink-0" data-sheet-close>
          {en ? 'Close' : 'Cerrar'}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-center text-[12px] text-[#fff8f0]">
          {error}
        </p>
      ) : null}
      {action}
    </Sheet>
  );
}

/** What a finished payment or send shows: its receipt, ready to share or download. */
export function ReceiptScreen({
  receipt,
  english: en,
  note,
  children,
}: {
  receipt: ReceiptData;
  english: boolean;
  note?: string;
  /** Follow-up actions (back home, send again). */
  children?: ReactNode;
}) {
  const card = useRef<HTMLDivElement>(null);
  const { busy, error, perform } = useReceiptExport(en);
  const url =
    receipt.hash && receipt.networkId ? explorerUrl(receipt.networkId, receipt.hash) : null;
  return (
    <div className="flex flex-1 flex-col justify-center" role="status" aria-live="polite">
      <ReceiptCard ref={card} receipt={receipt} english={en} note={note} />
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          className="btn btn-primary min-w-0 flex-1"
          disabled={busy}
          aria-busy={busy}
          onClick={() =>
            void perform(async () => {
              const result = await shareCard(card.current, {
                filename: receiptFile(receipt),
                text:
                  receipt.kind === 'paid'
                    ? en
                      ? `I paid ${receiptAmount(receipt, en)} ${receipt.currency} with GatoPago`
                      : `Pagué ${receiptAmount(receipt, en)} ${receipt.currency} con GatoPago`
                    : en
                      ? `I sent ${receiptAmount(receipt, en)} ${receipt.currency} with GatoPago`
                      : `Envié ${receiptAmount(receipt, en)} ${receipt.currency} con GatoPago`,
                url: url ?? undefined,
              });
              if (result === 'unsupported') await downloadCard(card.current, receiptFile(receipt));
            })
          }
        >
          {en ? 'Share' : 'Compartir'}
        </button>
        <button
          type="button"
          className="btn btn-ghost shrink-0"
          disabled={busy}
          aria-busy={busy}
          onClick={() => void perform(() => downloadCard(card.current, receiptFile(receipt)))}
        >
          {en ? 'Download' : 'Descargar'}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-center text-[12px] text-danger">
          {error}
        </p>
      ) : null}
      {children}
    </div>
  );
}
