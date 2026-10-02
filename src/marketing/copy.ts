export const copy = {
  es: {
    skip: 'Saltar al contenido',
    nav: {
      aria: 'Navegación principal', home: 'GatoPago — inicio', cycle: 'El recorrido',
      account: 'La cuenta', control: 'Tu control', open: 'Abrir GatoPago',
      menuOpen: 'Abrir menú', menuClose: 'Cerrar menú', language: 'Cambiar a inglés',
    },
    hero: {
      eyebrow: 'GatoPago · dólares en movimiento', titleLead: 'Tus dólares ya saben', titleAccent: 'moverse.',
      copy: 'Recibe y envía USDC de prueba desde una cuenta que tú controlas. Revisa el destino y los costos; tu passkey autoriza cada movimiento.',
      primary: 'Abrir GatoPago', secondary: 'Ver cómo funciona', alpha: 'Vista previa V3',
      network: 'Arbitrum Sepolia', funds: 'Sólo fondos de prueba', nap: 'Modo siesta',
      napOn: 'Modo siesta activado', napOff: 'El siguiente movimiento lo decides tú',
      visualLabel: 'Gato pixelado de GatoPago', visualNote: 'Tu cuenta se mueve cuando tú das la señal.', packet: 'Tú das la señal',
    },
    signals: [
      ['Tú autorizas', 'Cada movimiento necesita una llave activa.'],
      ['Acceso y firma separados', 'Entrar a la app no autoriza un envío.'],
      ['Costos claros', 'Revisa la cotización. Este entorno requiere ETH de prueba.'],
      ['Una red de prueba', 'Usa Arbitrum Sepolia; no envíes dinero real.'],
    ],
    cycle: {
      kicker: 'El recorrido de un envío', title: 'Tu dinero no vive en una lista de tokens.', accent: 'Vive en estados que entiendes.',
      intro: 'Conoce cada paso antes de probar la cuenta. Esta explicación no mueve fondos ni muestra una operación real.',
      demo: 'Cómo funciona', label: 'GUÍA',
      states: [
        { id: 'receive', number: '01', label: 'Recibir', short: 'Comparte tu perfil o dirección verificada.', detail: 'La app comprueba que la cuenta está desplegada en Arbitrum Sepolia antes de mostrar su dirección para recibir.', status: 'Dirección verificada' },
        { id: 'balance', number: '02', label: 'Consultar', short: 'Comprueba el saldo de tu cuenta.', detail: 'El saldo se consulta en la red. Una lectura fallida no significa cero, y un saldo observado no autoriza por sí solo un envío.', status: 'Saldo observado' },
        { id: 'review', number: '03', label: 'Revisar', short: 'Elige destinatario, monto y costos.', detail: 'Revisa la red, dirección, monto y costo máximo antes de autorizar el envío con tu passkey. Escanear un QR no firma ni envía fondos.', status: 'Tú autorizas' },
        { id: 'confirm', number: '04', label: 'Confirmar', short: 'Sigue el resultado del mismo envío.', detail: 'Enviar no equivale a completar. El comprobante depende de la evidencia de la red y de la reconciliación; una respuesta perdida no autoriza otro envío.', status: 'Resultado y comprobante' },
      ],
    },
    account: {
      kicker: 'La cuenta', title: 'Una cuenta, no un tablero de blockchain.',
      copy: 'Crea tu passkey, autoriza la configuración y el despliegue de tu cuenta. Después podrás publicar tu usuario para recibir.',
      productNotes: ['Una passkey basta para empezar', 'Tu dirección se verifica antes de recibir', 'Sólo tú autorizas los movimientos'],
      action: 'Crear mi cuenta de prueba',
    },
    move: {
      kicker: 'Usar', title: 'Mover dinero debería sentirse como elegir un camino.',
      copy: 'Acciones concretas para probar tu cuenta en Arbitrum Sepolia.',
      paths: [
        ['Recibir', 'Consulta tu dirección y perfil verificados.', 'R', '/receive'],
        ['Enviar', 'Revisa un envío a un usuario o dirección.', 'E', '/send'],
        ['Escanear', 'Lee una dirección o perfil sin autorizar nada.', 'Q', '/scan'],
        ['Consultar un envío', 'Usa su referencia para ver el resultado.', 'C', '/statement'],
      ],
      preview: 'Abrir en GatoPago',
    },
    control: {
      kicker: 'Control sin fricción', title: 'La experiencia es simple. El control no desaparece.',
      copy: 'Tu gestor guarda la passkey. La app te ayuda a usarla, pero soporte y correo no pueden reemplazar tus llaves.',
      items: [
        ['Passkey', 'Iniciar sesión no firma pagos. Cada operación requiere su propia confirmación.'],
        ['Conserva tus llaves', 'Una llave autorizada basta para usar tu cuenta. Si pierdes todas tus llaves autorizadas, pierdes el acceso a tus fondos.'],
        ['Resultados verificables', 'Destino, red, monto, costos y estado se muestran en el recorrido del envío. No se deduce un pago exitoso de un enlace o una respuesta de submit.'],
      ],
    },
    faq: {
      kicker: 'Preguntas honestas', title: 'Lo que conviene saber antes de entrar.',
      items: [
        ['¿GatoPago es un banco?', 'No. Es una interfaz para una cuenta onchain autocustodiada y programable. Sus riesgos y protecciones no son los de una cuenta bancaria.'],
        ['¿Ya usa dinero real?', 'No. Este entorno usa Arbitrum Sepolia y fondos de prueba. No envíes dinero real ni tokens de mainnet.'],
        ['¿Quién controla la cuenta?', 'Tú autorizas los movimientos con tus llaves. Iniciar sesión por sí solo no autoriza pagos. GatoPago no tiene autoridad para recuperar tu cuenta.'],
        ['¿Necesito dos passkeys?', 'No. Una llave autorizada basta en el perfil actual. Los respaldos son opcionales; si pierdes todas tus llaves autorizadas, GatoPago no puede restablecer el acceso.'],
        ['¿Quién paga el gas?', 'Este entorno no tiene patrocinio configurado. La cuenta necesita ETH de prueba para creación y envíos; revisa el costo máximo antes de firmar.'],
      ],
    },
    final: {
      eyebrow: 'Tu dinero, con siete vidas', title: 'Haz que cada pago caiga de pie.',
      copy: 'Ayúdanos a probar una cuenta más clara, útil y bajo tu control. Usa únicamente fondos de prueba en Arbitrum Sepolia.',
      primary: 'Abrir GatoPago', secondary: 'Volver al recorrido',
    },
    footer: {
      line: 'Tus dólares ya saben moverse. Tu cuenta sigue bajo tu control.', product: 'Producto', company: 'GatoPago', legal: 'Legal',
      terms: 'Términos', privacy: 'Privacidad', status: 'V3 · Arbitrum Sepolia · fondos de prueba', rights: 'GatoPago. Construido con cuidado en Bolivia.',
    },
  },
  en: {
    skip: 'Skip to content',
    nav: {
      aria: 'Main navigation', home: 'GatoPago — home', cycle: 'The journey',
      account: 'The account', control: 'Your control', open: 'Open GatoPago',
      menuOpen: 'Open menu', menuClose: 'Close menu', language: 'Cambiar a español',
    },
    hero: {
      eyebrow: 'GatoPago · dollars in motion', titleLead: 'Your dollars already', titleAccent: 'know how to move.',
      copy: 'Receive and send test USDC from an account you control. Review the destination and costs; your passkey authorizes every move.',
      primary: 'Open GatoPago', secondary: 'See how it works', alpha: 'V3 preview',
      network: 'Arbitrum Sepolia', funds: 'Test funds only', nap: 'Nap mode',
      napOn: 'Nap mode is on', napOff: 'You choose the next move',
      visualLabel: 'GatoPago pixel cat', visualNote: 'Your account moves when you give the signal.', packet: 'You give the signal',
    },
    signals: [
      ['You authorize', 'Every movement needs an active key.'],
      ['Access and signing are separate', 'Signing in does not authorize a transfer.'],
      ['Clear costs', 'Review the quote. This environment requires test ETH.'],
      ['One test network', 'Use Arbitrum Sepolia; do not send real money.'],
    ],
    cycle: {
      kicker: 'A transfer’s journey', title: 'Your money does not live in a token list.', accent: 'It lives in states you understand.',
      intro: 'Understand each step before trying the account. This explanation does not move funds or show a real operation.',
      demo: 'How it works', label: 'GUIDE',
      states: [
        { id: 'receive', number: '01', label: 'Receive', short: 'Share your verified profile or address.', detail: 'The app verifies that the account is deployed on Arbitrum Sepolia before showing its receiving address.', status: 'Verified address' },
        { id: 'balance', number: '02', label: 'Check', short: 'Check your account balance.', detail: 'The balance is read from the network. A failed read does not mean zero, and an observed balance does not itself authorize a transfer.', status: 'Observed balance' },
        { id: 'review', number: '03', label: 'Review', short: 'Choose recipient, amount and costs.', detail: 'Review the network, address, amount and maximum cost before authorizing with your passkey. Scanning a QR does not sign or send funds.', status: 'You authorize' },
        { id: 'confirm', number: '04', label: 'Confirm', short: 'Follow the result of the same transfer.', detail: 'Submitting is not completion. The receipt depends on network evidence and reconciliation; a lost response does not authorize another transfer.', status: 'Result and receipt' },
      ],
    },
    account: {
      kicker: 'The account', title: 'An account, not a blockchain dashboard.',
      copy: 'Create your passkey, authorize the configuration and deploy your account. Then publish your username to receive.',
      productNotes: ['One passkey is enough to start', 'Your address is verified before receiving', 'Only you authorize movements'], action: 'Create my test account',
    },
    move: {
      kicker: 'Use', title: 'Moving money should feel like choosing a path.',
      copy: 'Concrete actions to try your account on Arbitrum Sepolia.',
      paths: [
        ['Receive', 'View your verified address and profile.', 'R', '/receive'],
        ['Send', 'Review a transfer to a user or address.', 'S', '/send'],
        ['Scan', 'Read an address or profile without authorizing.', 'Q', '/scan'],
        ['Check a transfer', 'Use its reference to see the result.', 'C', '/statement'],
      ],
      preview: 'Open in GatoPago',
    },
    control: {
      kicker: 'Control without friction', title: 'The experience is simple. Control does not disappear.',
      copy: 'Your credential manager stores the passkey. The app helps you use it, but support and email cannot replace your keys.',
      items: [
        ['Passkey', 'Signing in does not sign payments. Each operation requires its own confirmation.'],
        ['Keep your keys', 'One authorized key is sufficient to use your account. If every authorized key is lost, access to your funds is lost.'],
        ['Verifiable results', 'Destination, network, amount, costs and state are shown throughout the transfer. A link or submit response does not prove a successful payment.'],
      ],
    },
    faq: {
      kicker: 'Honest questions', title: 'What you should know before entering.',
      items: [
        ['Is GatoPago a bank?', 'No. It is an interface for a self-custodial, programmable onchain account. Its risks and protections are not those of a bank account.'],
        ['Does it use real money yet?', 'No. This environment uses Arbitrum Sepolia and test funds. Do not send real money or mainnet tokens.'],
        ['Who controls the account?', 'You authorize movements with your keys. Signing in alone does not authorize payments. GatoPago has no recovery authority over your account.'],
        ['Do I need two passkeys?', 'No. One authorized key is sufficient in the current profile. Backups are optional; if every authorized key is lost, GatoPago cannot restore access.'],
        ['Who pays for gas?', 'Sponsorship is not configured in this environment. The account needs test ETH for creation and transfers; review the maximum cost before signing.'],
      ],
    },
    final: {
      eyebrow: 'Your money, with nine lives', title: 'Make every payment land on its feet.',
      copy: 'Help us test an account that is clearer, more useful, and under your control. Use test funds on Arbitrum Sepolia only.',
      primary: 'Open GatoPago', secondary: 'Back to the journey',
    },
    footer: {
      line: 'Your dollars already know how to move. Your account stays under your control.', product: 'Product', company: 'GatoPago', legal: 'Legal',
      terms: 'Terms', privacy: 'Privacy', status: 'V3 · Arbitrum Sepolia · test funds', rights: 'GatoPago. Built with care in Bolivia.',
    },
  },
} as const;
