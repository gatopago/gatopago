import type { Address, Hex } from 'viem';

/** The passkey this device signs with and the account it owns. */
export interface Wallet {
  /** The passkey in use on this device. */
  readonly credentialId: string;
  /** The key Mera derives from that passkey, an owner of the account. */
  readonly owner: Address;
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
const memory = new Map<string, string | null>();
let cached: { raw: string | null; session: Session | null } = { raw: null, session: null };

function read(key: string): string | null {
  if (memory.has(key)) return memory.get(key) ?? null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  const raw = value === null ? null : JSON.stringify(value);
  try {
    if (raw === null) localStorage.removeItem(key);
    else localStorage.setItem(key, raw);
    memory.delete(key);
  } catch {
    // Storage unavailable: keep this page's session in memory, never on the server.
    memory.set(key, raw);
  }
}

function notify() {
  listeners.forEach((listener) => listener());
}

function parsed<T>(raw: string | null): T | null {
  try {
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function isWallet(value: Wallet | null | undefined): value is Wallet {
  return !!(
    value &&
    typeof value.address === 'string' &&
    typeof value.credentialId === 'string' &&
    typeof value.owner === 'string' &&
    Array.isArray(value.initialOwners)
  );
}

/** The current session, or null when signed out or expired. Stable between changes. */
export function currentSession(): Session | null {
  const raw = read(SESSION);
  if (raw !== cached.raw) {
    const session = parsed<Session>(raw);
    cached = {
      raw,
      session:
        session && typeof session.token === 'string' && isWallet(session.wallet) ? session : null,
    };
  }
  const session = cached.session;
  return session && session.expiresAt > Date.now() / 1000 + 60 ? session : null;
}

function onStorage(event: StorageEvent) {
  if (event.key === SESSION || event.key === null) {
    memory.delete(SESSION);
    notify();
  }
}

export function subscribeSession(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}

export function saveSession(session: Session) {
  write(WALLET, session.wallet);
  write(SESSION, session);
  notify();
}

export function signOut() {
  write(SESSION, null);
  // The profile cached for the header (useProfile) goes with the session.
  write('gatopago:profile', null);
  notify();
}

export function knownWallet(): Wallet | null {
  const wallet = parsed<Wallet>(read(WALLET));
  return isWallet(wallet) ? wallet : null;
}
