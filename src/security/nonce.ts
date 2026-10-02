export const NONCE_HEADER = 'x-gatopago-csp-nonce';
export const validNonce = (value: string | null | undefined): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9+/]{43}=$/.test(value);
