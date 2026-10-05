import { ApiError } from './api';

const messages: Record<string, [es: string, en: string]> = {
  CANCELLED: [
    'Se canceló la confirmación en tu dispositivo. Puedes reintentar.',
    'Confirmation was cancelled on your device. You can try again.',
  ],
  PASSKEY_EXISTS: [
    'Este gestor ya tiene una llave de GatoPago. Usa otro gestor o una llave física.',
    'This manager already has a GatoPago key. Use another manager or a security key.',
  ],
  ACCOUNT_NOT_FOUND: [
    'Esa llave no pertenece a una cuenta de GatoPago. Si eres nuevo, crea una cuenta.',
    'That key does not belong to a GatoPago account. If you are new, create an account.',
  ],
  INVITE_REQUIRED: [
    'Necesitas una invitación para crear una cuenta.',
    'You need an invitation to create an account.',
  ],
  INVITE_INVALID: [
    'Esta invitación no está disponible. Revisa el código.',
    'This invitation is unavailable. Check the code.',
  ],
  TURNSTILE_FAILED: [
    'No pudimos validar la comprobación de seguridad. Reintenta.',
    'We could not validate the security check. Try again.',
  ],
  TURNSTILE_UNAVAILABLE: [
    'La comprobación de seguridad no terminó. Revisa tu conexión y reintenta.',
    'The security check did not finish. Check your connection and try again.',
  ],
  USERNAME_TAKEN: ['Ese nombre de usuario ya está en uso.', 'That username is taken.'],
  SELF_CONTACT: ['No puedes agregarte a ti mismo.', "You can't add yourself."],
  INVALID_SOCIAL_URL: [
    'Usa un enlace https de Instagram, X, Telegram, TikTok o Facebook.',
    'Use an https link from Instagram, X, Telegram, TikTok or Facebook.',
  ],
  USERNAME_ALREADY_SET: [
    'Tu nombre de usuario ya está elegido.',
    'Your username is already chosen.',
  ],
  INVALID_USERNAME: [
    'Usa 3–30 caracteres: minúsculas, números y guion bajo, empezando con una letra.',
    'Use 3–30 characters: lowercase letters, numbers and underscores, starting with a letter.',
  ],
  RECIPIENT_NOT_FOUND: ['No existe ese usuario.', 'That user does not exist.'],
  SPONSORSHIP_LIMIT_REACHED: [
    'Llegaste al límite diario de operaciones gratuitas. Vuelve mañana.',
    'You reached the daily limit of free operations. Come back tomorrow.',
  ],
  INVALID_AMOUNT: ['Ingresa un monto mayor a cero.', 'Enter an amount above zero.'],
  INSUFFICIENT_FUNDS: [
    'No te alcanza el saldo. Si está repartido entre redes, júntalo en “Entre redes”.',
    'Your balance is not enough. If it is spread across networks, gather it in “Between networks”.',
  ],
  INVALID_ADDRESS: [
    'Dirección inválida: debe ser una dirección 0x válida.',
    'Invalid address: it must be a valid 0x address.',
  ],
  SELF_TRANSFER: ['Esa es tu propia cuenta.', 'That is your own account.'],
  BALANCE_ON_OTHER_NETWORK: [
    'Tu saldo en esta red no alcanza. Júntalo aquí desde tus otras redes en “Entre redes”.',
    'Your balance on this network is not enough. Gather it here from your other networks in “Between networks”.',
  ],
  CCTP_FEE_UNAVAILABLE: [
    'No pudimos consultar la comisión entre redes. Reintenta en un momento.',
    'We could not get the cross-network fee. Try again in a moment.',
  ],
  CCTP_AMOUNT_BELOW_FEE: [
    'El monto es menor que la comisión entre redes.',
    'The amount is below the cross-network fee.',
  ],
  RATE_LIMITED: [
    'Hay demasiados intentos. Espera un momento.',
    'Too many attempts. Wait a moment.',
  ],
  UNAUTHENTICATED: ['Tu sesión venció. Vuelve a entrar.', 'Your session expired. Sign in again.'],
  NETWORK_ERROR: [
    'No hay conexión con GatoPago. Reintenta.',
    'GatoPago cannot be reached. Try again.',
  ],
};

/** A message for the person for any failure: API codes, passkey prompts and bundler errors. */
export function failureMessage(error: unknown, en: boolean): string {
  const [es, english] = messages[failureCode(error)] ?? [
    'No pudimos completar este paso. Reintenta.',
    'We could not complete this step. Try again.',
  ];
  return en ? english : es;
}

function failureCode(error: unknown): string {
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    if (cause instanceof ApiError) return cause.code;
    if (cause.name === 'NotAllowedError' || cause.name === 'AbortError') return 'CANCELLED';
    if (cause.name === 'InvalidStateError') return 'PASSKEY_EXISTS';
    const own = /^([A-Z_]+)(?::|$)/.exec(cause.message);
    if (own) return own[1];
    // Paymaster and bundler failures reach viem as HTTP errors carrying our response body.
    const code = /"error_code":"([A-Z_]+)"/.exec(cause.message);
    if (code) return code[1];
  }
  return 'UNKNOWN';
}
