import type { Address, Hex } from 'viem';

/** The passkey this device signs with and the account it owns. */
export interface Wallet {
  readonly credentialId: string;
  readonly publicKey: Hex;
  readonly address: Address;
  /** Owners the account was created with; its address derives from them. */
  readonly initialOwners: readonly Hex[];
}

export interface Session {
  readonly token: string;
  readonly expiresAt: number;
  readonly userId: string;
  readonly wallet: Wallet;
}

const SESSION = 'gatopago.session';
/** The last wallet signed in on this device, so the next sign-in needs a single passkey prompt. */
const WALLET = 'gatopago.wallet';
const listeners = new Set<() => void>();
let cached: { raw: string | null; session: Session | null } = { raw: null, session: null };

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Private mode: the session lasts for this page only. */
  }
  listeners.forEach((listener) => listener());
}

/** The current session, or null when signed out or expired. Stable between changes. */
export function currentSession(): Session | null {
  const raw = read(SESSION);
  if (raw !== cached.raw) cached = { raw, session: raw ? (JSON.parse(raw) as Session) : null };
  const session = cached.session;
  return session && session.expiresAt > Date.now() / 1000 + 60 ? session : null;
}

export function subscribeSession(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

export function saveSession(session: Session) {
  write(WALLET, session.wallet);
  write(SESSION, session);
}

export function signOut() {
  write(SESSION, null);
}

export function knownWallet(): Wallet | null {
  const raw = read(WALLET);
  return raw ? (JSON.parse(raw) as Wallet) : null;
}

export function forgetWallet() {
  write(WALLET, null);
}
