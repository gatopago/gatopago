import type { Locale } from 'next-intl';
import { settings } from '../lib/settings';

/**
 * What a shared link shows before it is opened: the same that anyone with the link sees on the
 * page. Never a payment's status: chat apps keep a preview for days, and it would go stale.
 */
export interface PaymentPreview {
  merchant: string | null;
  /** USDC, as Flow returns it (`"18.00"`). */
  amount: string;
  concept: string | null;
}

export interface ProfilePreview {
  username: string;
  name: string | null;
}

export const PAYMENT_ID = /^pi_[0-9a-f]{32}$/;
export const USERNAME = /^[a-zA-Z][a-zA-Z0-9_]{2,29}$/;
const AMOUNT = /^\d+(?:\.\d{1,6})?$/;

/** How long a preview waits for the API: crawlers give up soon, and a generic card beats none. */
const API_WAIT_MS = 1500;

async function read(path: string): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(`${settings.apiOrigin}${path}`, {
      signal: AbortSignal.timeout(API_WAIT_MS),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A text from the API, trimmed and cut so it fits its line in the card. */
function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const clean = value.trim().replace(/\s+/g, ' ');
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** A payment link's preview, or `null` when it does not exist or Flow does not answer in time. */
export async function paymentPreview(id: string): Promise<PaymentPreview | null> {
  if (!PAYMENT_ID.test(id)) return null;
  const intent = await read(`/checkout/v1/${id}`);
  if (!intent || typeof intent.amount !== 'string' || !AMOUNT.test(intent.amount)) return null;
  const merchant = intent.merchant as { name?: unknown } | null | undefined;
  return {
    merchant: text(merchant?.name, 40),
    amount: intent.amount,
    concept: text(intent.description, 80),
  };
}

/** A public profile's preview, or `null` when the username is free or Wallet Core is not there. */
export async function profilePreview(username: string): Promise<ProfilePreview | null> {
  if (!USERNAME.test(username)) return null;
  const recipient = await read(`/app/v1/recipients/${username.toLowerCase()}`);
  if (!recipient || typeof recipient.username !== 'string') return null;
  return { username: recipient.username, name: text(recipient.display_name, 40) };
}

/** A USDC amount as the app writes it: grouped in the language, two to six decimals. */
export function formatUsdc(amount: string, locale: Locale) {
  const [whole, fraction = ''] = amount.split('.');
  const grouped = new Intl.NumberFormat(locale).format(BigInt(whole));
  return `${grouped}${locale === 'en' ? '.' : ','}${fraction.padEnd(2, '0')}`;
}
