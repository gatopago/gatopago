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
  PASSKEY_WITHOUT_PRF: [
    'No encontramos tu cuenta con esta llave en este dispositivo. Entra desde el dispositivo donde creaste tu cuenta o con tu llave de respaldo.',
    'We could not find your account with this key on this device. Sign in from the device where you created it, or with your backup key.',
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
  STELLAR_TRANSACTION_PENDING: [
    'Tu operación sigue en proceso. Revisa Actividad en un momento antes de repetirla.',
    'Your operation is still in progress. Check Activity in a moment before repeating it.',
  ],
  // A coin other than USDC lives on one network: there is nothing to bring from another.
  INSUFFICIENT_COIN: [
    'No te alcanza el saldo de esa moneda.',
    'You do not have enough of that coin.',
  ],
  INSUFFICIENT_FUNDS: [
    'No te alcanza el saldo. Si está repartido entre redes, júntalo en “Entre redes”.',
    'Your balance is not enough. If it is spread across networks, gather it in “Between networks”.',
  ],
  INVALID_ADDRESS: [
    'Dirección inválida: debe ser una dirección 0x válida.',
    'Invalid address: it must be a valid 0x address.',
  ],
  SELF_TRANSFER: ['Esa es tu propia cuenta.', 'That is your own account.'],
  INVALID_STELLAR_ADDRESS: [
    'Dirección de Stellar inválida: debe empezar con G o C.',
    'Invalid Stellar address: it must start with G or C.',
  ],
  STELLAR_RECIPIENT_CANNOT_RECEIVE: [
    'Esa cuenta de Stellar no acepta USDC todavía: debe activar USDC (trustline) primero.',
    'That Stellar account does not accept USDC yet: it must add USDC (a trustline) first.',
  ],
  STELLAR_ACCOUNT_INACTIVE: [
    'Esa cuenta de Stellar no existe o todavía no está activa: no puede recibir XLM.',
    'That Stellar account does not exist or is not active yet: it cannot receive XLM.',
  ],
  STELLAR_SIGNER_PENDING: [
    'La llave de este dispositivo aún no firma en Stellar. Sincronízala en Seguridad desde un dispositivo que ya firme allí.',
    'This device key does not sign on Stellar yet. Sync it in Security from a device that already does.',
  ],
  APPROVAL_EXPIRED: ['La autorización venció. Reintenta.', 'The authorization expired. Try again.'],
  NOT_AN_OWNER: ['Esa llave no es dueña de tu cuenta.', 'That key does not own your account.'],
  STELLAR_NOT_ENABLED: ['Stellar no está disponible ahora.', 'Stellar is not available now.'],
  STELLAR_ACCOUNT_WITHOUT_SIGNERS: [
    'Tu cuenta no tiene una llave que pueda firmar en Stellar. Agrega una llave de respaldo en Seguridad.',
    'Your account has no key that can sign on Stellar. Add a backup key in Security.',
  ],
  STELLAR_RELAY_REJECTED: [
    'GatoPago no pudo entregar este envío en Stellar. Tus fondos siguen en Circle: escríbenos.',
    'GatoPago could not deliver this transfer on Stellar. Your funds remain with Circle: contact us.',
  ],
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
  PAYOUT_SIZE: ['Agrega entre 1 y 10 personas.', 'Add between 1 and 10 people.'],
  DUPLICATE_RECIPIENT: [
    'Hay una persona repetida: junta sus montos en una sola fila.',
    'Someone appears twice: put their amounts in a single row.',
  ],
  APPROVAL_PENDING: [
    'El cambio quedó guardado, pero falta aplicarlo en algunas redes: revisa el estado de cada una abajo. Se completa solo en tu próxima operación en esa red.',
    'The change is saved but still pending on some networks: check each one below. It completes on your next operation there.',
  ],
  OPERATION_PENDING: [
    'Tu operación anterior sigue en proceso. Revisa Actividad en un momento antes de repetirla.',
    'Your previous operation is still in progress. Check Activity in a moment before repeating it.',
  ],
  VAULT_UNAVAILABLE: [
    'Tu llave no permite guardar datos cifrados en este dispositivo, así que tu equipo queda guardado solo aquí.',
    'Your key cannot keep encrypted data on this device, so your team stays saved here only.',
  ],
  VAULT_ELSEWHERE: [
    'Tu equipo guardado se abre con otra de tus llaves. Entra con esa llave para verlo aquí.',
    'Your saved team opens with another of your keys. Sign in with that key to see it here.',
  ],
  VAULT_UNREADABLE: [
    'No pudimos abrir tu equipo guardado con esta llave. Tu dinero no se ve afectado.',
    'We could not open your saved team with this key. Your money is not affected.',
  ],
  STORAGE_UNAVAILABLE: [
    'No se envió nada: tu navegador no deja que GatoPago guarde datos en este sitio, y los necesitamos para que un envío nunca salga dos veces. Permite el almacenamiento del sitio (o sal del modo privado) y vuelve a intentar.',
    'Nothing was sent: your browser does not let GatoPago store data on this site, and we need it so a payment never goes out twice. Allow site storage (or leave private browsing) and try again.',
  ],
  PREVIOUS_OPERATION_CONFIRMED: [
    'Tu operación anterior ya se confirmó. Revisa Actividad antes de volver a enviarla.',
    'Your previous operation went through. Check Activity before sending it again.',
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
