export const copy = {
  "es": {
    "skip": "Saltar al contenido",
    "nav": {
      "aria": "Navegación principal",
      "home": "GatoPago — inicio",
      "cycle": "El ciclo",
      "account": "La cuenta",
      "grow": "Crecer",
      "card": "Card",
      "developers": "Developers",
      "open": "Abrir GatoPago",
      "menuOpen": "Abrir menú",
      "menuClose": "Cerrar menú",
      "language": "Cambiar a inglés",
      "control": "Tu control"
    },
    "hero": {
      "eyebrow": "GatoPago · dólares en movimiento",
      "titleLead": "Tus dólares ya saben",
      "titleAccent": "moverse.",
      "copy": "Cobra, paga, cambia y haz crecer dólares digitales desde una cuenta que tú controlas. GatoPago se ocupa del camino; tú decides cada movimiento.",
      "primary": "Abrir GatoPago",
      "secondary": "Ver cómo funciona",
      "alpha": "Vista previa V3",
      "network": "Arbitrum Sepolia",
      "funds": "Sólo fondos de prueba",
      "nap": "Modo siesta",
      "napOn": "Modo siesta activado",
      "napOff": "Seguimos la pista de tu dinero",
      "visualLabel": "Gato pixelado de GatoPago",
      "visualNote": "Tu cuenta se mueve cuando tú das la señal.",
      "packet": "Pago en camino"
    },
    "signals": [
      [
        "Tú autorizas",
        "Cada movimiento necesita una llave activa."
      ],
      [
        "Acceso y firma separados",
        "Entrar a la app no autoriza un envío."
      ],
      [
        "Costos claros",
        "Revisa la cotización. Este entorno requiere ETH de prueba."
      ],
      [
        "Una red de prueba",
        "Usa Arbitrum Sepolia; no envíes dinero real."
      ]
    ],
    "cycle": {
      "kicker": "El recorrido de un pago",
      "title": "Tu dinero no vive en una lista de tokens.",
      "accent": "Vive en estados que entiendes.",
      "intro": "Explora el recorrido de tu dinero. Esta guía explica cada etapa con ejemplos; no mueve fondos.",
      "demo": "Explorador interactivo",
      "states": [
        {
          "id": "receive",
          "number": "01",
          "label": "Recibir",
          "short": "Alguien paga tu link, QR o usuario.",
          "detail": "El pago entra a tu cuenta onchain. Ves de dónde llegó, el monto y la red antes de hacer cualquier otra cosa.",
          "status": "Pago detectado"
        },
        {
          "id": "available",
          "number": "02",
          "label": "Disponible",
          "short": "Listo para pagar, enviar o cambiar.",
          "detail": "Disponible es la parte líquida de tu saldo. No necesitas aprender nombres de contratos para saber qué puedes usar ahora.",
          "status": "Saldo listo"
        },
        {
          "id": "growing",
          "number": "03",
          "label": "Creciendo",
          "short": "Una parte puede entrar a Aave V3.",
          "detail": "Tú eliges cuánto mover. La tasa es variable y la app debe mostrar riesgos, protocolo y salida antes de confirmar.",
          "status": "Ruta preparada"
        },
        {
          "id": "use",
          "number": "04",
          "label": "Usar",
          "short": "Paga, envía, cambia o retira.",
          "detail": "El dinero vuelve a moverse cuando tú decides. GatoPago presenta la ruta; tu llave autoriza el resultado.",
          "status": "Tú decides el siguiente paso"
        }
      ],
      "label": "GUÍA"
    },
    "account": {
      "kicker": "La cuenta",
      "greeting": "Hola, Dani",
      "title": "Una cuenta, no un tablero de blockchain.",
      "copy": "Crea tu passkey, autoriza la configuración y el despliegue de tu cuenta. Después podrás publicar tu usuario para recibir.",
      "concept": "Concepto visual · datos de ejemplo",
      "available": "Disponible",
      "growing": "Creciendo",
      "actions": [
        "Pagar",
        "Enviar",
        "Cambiar",
        "Escanear"
      ],
      "activity": "Actividad reciente",
      "received": "Pago recibido",
      "receivedFrom": "de @cafe.norte",
      "productNotes": [
        "Jerarquía clara antes que densidad",
        "Montos y estados en lenguaje humano",
        "Detalle técnico disponible, nunca impuesto"
      ],
      "action": "Crear mi cuenta de prueba"
    },
    "receive": {
      "kicker": "Cobrar",
      "title": "Cobra sin perseguir el pago.",
      "copy": "Crea un link o un QR con monto y concepto. Compártelo donde ya conversas; la otra persona abre, revisa y firma el pago.",
      "linkLabel": "Link de cobro",
      "amountLabel": "Total",
      "item": "2 cafés + pan de queso",
      "status": "Ejemplo · no cobrable",
      "copyLink": "Copiar ejemplo",
      "copied": "¡Ejemplo copiado!",
      "note": "Esta es una demostración visual. El enlace no cobra ni permite enviar fondos.",
      "channels": [
        "WhatsApp",
        "QR",
        "Mensaje",
        "NFC · futuro"
      ]
    },
    "grow": {
      "kicker": "Crecer",
      "titleLead": "Una parte lista.",
      "titleAccent": "Otra, creciendo.",
      "copy": "Separa el dinero que usarás pronto del que quieres poner a trabajar. Sin ocultar protocolo, variabilidad ni riesgo.",
      "available": "Disponible",
      "growing": "Creciendo",
      "amount": "USDC 280.00",
      "route": "Ruta guiada",
      "routeValue": "GatoPago → Aave V3",
      "rate": "Tasa",
      "rateValue": "Variable, no garantizada",
      "exit": "Salida",
      "exitValue": "Solicitada por ti",
      "risk": "Antes de confirmar verás riesgos, costos y condiciones del protocolo.",
      "action": "Ver cómo funciona"
    },
    "move": {
      "kicker": "Usar",
      "title": "Mover dinero debería sentirse como elegir un camino.",
      "copy": "Cuatro verbos reconocibles. Cada ruta termina en una vista previa que puedes entender antes de autorizar.",
      "paths": [
        [
          "Pagar",
          "Un link, un QR o una solicitud.",
          "P"
        ],
        [
          "Enviar",
          "A un usuario o una dirección compatible.",
          "E"
        ],
        [
          "Cambiar",
          "Cotización y costos antes de firmar.",
          "C"
        ],
        [
          "Escanear",
          "La cámara encuentra el siguiente paso.",
          "Q"
        ]
      ],
      "preview": "Siempre hay vista previa"
    },
    "control": {
      "kicker": "Control sin fricción",
      "title": "La experiencia es simple. El control no desaparece.",
      "copy": "Tu gestor guarda la passkey. La app te ayuda a usarla, pero soporte y correo no pueden reemplazar tus llaves.",
      "items": [
        [
          "Passkey",
          "Iniciar sesión no firma pagos. Cada operación requiere su propia confirmación."
        ],
        [
          "Conserva tus llaves",
          "Una llave autorizada basta para usar tu cuenta. Si pierdes todas tus llaves autorizadas, pierdes el acceso a tus fondos."
        ],
        [
          "Resultados verificables",
          "Destino, red, monto, costos y estado se muestran en el recorrido del envío. No se deduce un pago exitoso de un enlace o una respuesta de submit."
        ]
      ],
      "demo": "Probar diálogo de confirmación",
      "demoHint": "Así se ve una decisión importante en GatoPago."
    },
    "dialog": {
      "eyebrow": "Vista previa",
      "title": "Revisa antes de mover",
      "amount": "18.00 USDC",
      "rows": [
        [
          "Destino",
          "@cafe.norte"
        ],
        [
          "Concepto",
          "Desayuno"
        ],
        [
          "Red",
          "Arbitrum Sepolia"
        ],
        [
          "Costo estimado",
          "Según cotización"
        ]
      ],
      "disclaimer": "Datos de ejemplo. Nada se enviará desde esta demostración.",
      "cancel": "Volver",
      "confirm": "Entendido",
      "close": "Cerrar diálogo"
    },
    "card": {
      "kicker": "Próximo camino",
      "title": "El siguiente paso conecta con el mundo cotidiano.",
      "copy": "GatoPago Card está en exploración. La diseñamos como una extensión del mismo saldo, pero todavía no prometemos fecha, cobertura ni condiciones.",
      "badge": "Concepto futuro",
      "cardLabel": "GATOPAGO · CONCEPTO",
      "cardName": "DANI",
      "waitlist": "Consultar preguntas frecuentes",
      "notice": "No disponible. Este sitio no registra solicitudes ni reservas."
    },
    "developers": {
      "kicker": "GatoPago para Developers",
      "title": "Dale más vidas a tus pagos.",
      "copy": "Payment intents, checkout, sandbox y webhooks firmados para pilotos que necesitan mover USDC sin diseñar una wallet desde cero.",
      "features": [
        "Payment intents",
        "Idempotencia",
        "Webhooks firmados",
        "Sandbox de prueba"
      ],
      "docs": "Explorar documentación",
      "pilot": "Conversar sobre un piloto",
      "response": "intent creada",
      "note": "La API comercial requiere autenticación. Consulta la documentación para integrar tu entorno."
    },
    "faq": {
      "kicker": "Preguntas honestas",
      "title": "Lo que conviene saber antes de entrar.",
      "items": [
        [
          "¿GatoPago es un banco?",
          "No. Es una interfaz para una cuenta onchain autocustodiada y programable. Sus riesgos y protecciones no son los de una cuenta bancaria."
        ],
        [
          "¿Ya usa dinero real?",
          "No. Este entorno usa Arbitrum Sepolia y fondos de prueba. No envíes dinero real ni tokens de mainnet."
        ],
        [
          "¿Quién controla la cuenta?",
          "Tú autorizas los movimientos con tus llaves. Iniciar sesión por sí solo no autoriza pagos. GatoPago no tiene autoridad para recuperar tu cuenta."
        ],
        [
          "¿Necesito dos passkeys?",
          "No. Una llave autorizada basta en el perfil actual. Los respaldos son opcionales; si pierdes todas tus llaves autorizadas, GatoPago no puede restablecer el acceso."
        ],
        [
          "¿Quién paga el gas?",
          "Este entorno no tiene patrocinio configurado. La cuenta necesita ETH de prueba para creación y envíos; revisa el costo máximo antes de firmar."
        ]
      ]
    },
    "final": {
      "eyebrow": "Tu dinero, con siete vidas",
      "title": "Haz que cada pago caiga de pie.",
      "copy": "Ayúdanos a probar una cuenta más clara, útil y bajo tu control. Usa únicamente fondos de prueba en Arbitrum Sepolia.",
      "primary": "Abrir GatoPago",
      "secondary": "Volver al recorrido"
    },
    "footer": {
      "line": "Tus dólares ya saben moverse. Tu cuenta sigue bajo tu control.",
      "product": "Producto",
      "company": "GatoPago",
      "legal": "Legal",
      "links": [
        "El ciclo",
        "La cuenta",
        "Crecer",
        "Developers"
      ],
      "terms": "Términos",
      "privacy": "Privacidad",
      "status": "V3 · Arbitrum Sepolia · fondos de prueba",
      "rights": "GatoPago. Construido con cuidado en Bolivia."
    }
  },
  "en": {
    "skip": "Skip to content",
    "nav": {
      "aria": "Main navigation",
      "home": "GatoPago — home",
      "cycle": "The cycle",
      "account": "The account",
      "grow": "Grow",
      "card": "Card",
      "developers": "Developers",
      "open": "Open GatoPago",
      "menuOpen": "Open menu",
      "menuClose": "Close menu",
      "language": "Cambiar a español",
      "control": "Your control"
    },
    "hero": {
      "eyebrow": "GatoPago · dollars in motion",
      "titleLead": "Your dollars already",
      "titleAccent": "know how to move.",
      "copy": "Get paid, pay, swap, and grow digital dollars from an account you control. GatoPago handles the path; you authorize every move.",
      "primary": "Open GatoPago",
      "secondary": "See how it works",
      "alpha": "V3 preview",
      "network": "Arbitrum Sepolia",
      "funds": "Test funds only",
      "nap": "Nap mode",
      "napOn": "Nap mode is on",
      "napOff": "We are tracking your money",
      "visualLabel": "GatoPago pixel cat",
      "visualNote": "Your account moves when you give the signal.",
      "packet": "Payment on the move"
    },
    "signals": [
      [
        "You authorize",
        "Every movement needs an active key."
      ],
      [
        "Access and signing are separate",
        "Signing in does not authorize a transfer."
      ],
      [
        "Clear costs",
        "Review the quote. This environment requires test ETH."
      ],
      [
        "One test network",
        "Use Arbitrum Sepolia; do not send real money."
      ]
    ],
    "cycle": {
      "kicker": "A payment’s journey",
      "title": "Your money does not live in a token list.",
      "accent": "It lives in states you understand.",
      "intro": "Explore your money’s journey. This guide explains each stage with examples; it does not move funds.",
      "demo": "Interactive explorer",
      "states": [
        {
          "id": "receive",
          "number": "01",
          "label": "Receive",
          "short": "Someone pays your link, QR, or username.",
          "detail": "The payment reaches your onchain account. You see its source, amount, and network before doing anything else.",
          "status": "Payment detected"
        },
        {
          "id": "available",
          "number": "02",
          "label": "Available",
          "short": "Ready to pay, send, or swap.",
          "detail": "Available is the liquid part of your balance. You do not need to learn contract names to know what you can use now.",
          "status": "Balance ready"
        },
        {
          "id": "growing",
          "number": "03",
          "label": "Growing",
          "short": "A portion can enter Aave V3.",
          "detail": "You choose how much to move. The rate is variable, and the app must show risks, protocol, and exit before confirmation.",
          "status": "Route prepared"
        },
        {
          "id": "use",
          "number": "04",
          "label": "Use",
          "short": "Pay, send, swap, or withdraw.",
          "detail": "The money moves again when you decide. GatoPago presents the route; your key authorizes the outcome.",
          "status": "You choose the next step"
        }
      ],
      "label": "GUIDE"
    },
    "account": {
      "kicker": "The account",
      "greeting": "Hi, Dani",
      "title": "An account, not a blockchain dashboard.",
      "copy": "Create your passkey, authorize the configuration and deploy your account. Then publish your username to receive.",
      "concept": "Visual concept · example data",
      "available": "Available",
      "growing": "Growing",
      "actions": [
        "Pay",
        "Send",
        "Swap",
        "Scan"
      ],
      "activity": "Recent activity",
      "received": "Payment received",
      "receivedFrom": "from @cafe.norte",
      "productNotes": [
        "Clear hierarchy over density",
        "Amounts and states in human language",
        "Technical detail available, never imposed"
      ],
      "action": "Create my test account"
    },
    "receive": {
      "kicker": "Get paid",
      "title": "Get paid without chasing the payment.",
      "copy": "Create a link or QR with an amount and note. Share it where you already talk; the other person opens, reviews, and signs the payment.",
      "linkLabel": "Payment link",
      "amountLabel": "Total",
      "item": "2 coffees + cheese bread",
      "status": "Example · not payable",
      "copyLink": "Copy example",
      "copied": "Example copied!",
      "note": "This is a visual demonstration. The link does not collect payments or allow funds to be sent.",
      "channels": [
        "WhatsApp",
        "QR",
        "Message",
        "NFC · future"
      ]
    },
    "grow": {
      "kicker": "Grow",
      "titleLead": "One part ready.",
      "titleAccent": "Another, growing.",
      "copy": "Separate the money you will use soon from what you want to put to work. Without hiding protocol, variability, or risk.",
      "available": "Available",
      "growing": "Growing",
      "amount": "USDC 280.00",
      "route": "Guided route",
      "routeValue": "GatoPago → Aave V3",
      "rate": "Rate",
      "rateValue": "Variable, not guaranteed",
      "exit": "Exit",
      "exitValue": "Requested by you",
      "risk": "Before confirming, you will see protocol risks, costs, and conditions.",
      "action": "See how it works"
    },
    "move": {
      "kicker": "Use",
      "title": "Moving money should feel like choosing a path.",
      "copy": "Four recognizable verbs. Every path ends in a preview you can understand before authorizing.",
      "paths": [
        [
          "Pay",
          "A link, QR, or request.",
          "P"
        ],
        [
          "Send",
          "To a user or compatible address.",
          "S"
        ],
        [
          "Swap",
          "Quote and costs before signing.",
          "W"
        ],
        [
          "Scan",
          "The camera finds the next step.",
          "Q"
        ]
      ],
      "preview": "There is always a preview"
    },
    "control": {
      "kicker": "Control without friction",
      "title": "The experience is simple. Control does not disappear.",
      "copy": "Your credential manager stores the passkey. The app helps you use it, but support and email cannot replace your keys.",
      "items": [
        [
          "Passkey",
          "Signing in does not sign payments. Each operation requires its own confirmation."
        ],
        [
          "Keep your keys",
          "One authorized key is sufficient to use your account. If every authorized key is lost, access to your funds is lost."
        ],
        [
          "Verifiable results",
          "Destination, network, amount, costs and state are shown throughout the transfer. A link or submit response does not prove a successful payment."
        ]
      ],
      "demo": "Try the confirmation dialog",
      "demoHint": "This is how an important decision looks in GatoPago."
    },
    "dialog": {
      "eyebrow": "Preview",
      "title": "Review before moving",
      "amount": "18.00 USDC",
      "rows": [
        [
          "Destination",
          "@cafe.norte"
        ],
        [
          "Note",
          "Breakfast"
        ],
        [
          "Network",
          "Arbitrum Sepolia"
        ],
        [
          "Estimated cost",
          "Based on the quote"
        ]
      ],
      "disclaimer": "Example data. Nothing will be sent from this demo.",
      "cancel": "Go back",
      "confirm": "Got it",
      "close": "Close dialog"
    },
    "card": {
      "kicker": "Next path",
      "title": "The next step connects to everyday life.",
      "copy": "GatoPago Card is being explored. We are designing it as an extension of the same balance, but we are not promising a date, coverage, or terms yet.",
      "badge": "Future concept",
      "cardLabel": "GATOPAGO · CONCEPT",
      "cardName": "DANI",
      "waitlist": "Read the FAQ",
      "notice": "Not available. This site does not record requests or reservations."
    },
    "developers": {
      "kicker": "GatoPago for Developers",
      "title": "Give your payments more lives.",
      "copy": "Payment intents, checkout, sandbox, and signed webhooks for pilots that need to move USDC without designing a wallet from scratch.",
      "features": [
        "Payment intents",
        "Idempotency",
        "Signed webhooks",
        "Test sandbox"
      ],
      "docs": "Explore documentation",
      "pilot": "Talk about a pilot",
      "response": "intent created",
      "note": "The commercial API requires authentication. Consult the documentation to integrate your environment."
    },
    "faq": {
      "kicker": "Honest questions",
      "title": "What you should know before entering.",
      "items": [
        [
          "Is GatoPago a bank?",
          "No. It is an interface for a self-custodial, programmable onchain account. Its risks and protections are not those of a bank account."
        ],
        [
          "Does it use real money yet?",
          "No. This environment uses Arbitrum Sepolia and test funds. Do not send real money or mainnet tokens."
        ],
        [
          "Who controls the account?",
          "You authorize movements with your keys. Signing in alone does not authorize payments. GatoPago has no recovery authority over your account."
        ],
        [
          "Do I need two passkeys?",
          "No. One authorized key is sufficient in the current profile. Backups are optional; if every authorized key is lost, GatoPago cannot restore access."
        ],
        [
          "Who pays for gas?",
          "Sponsorship is not configured in this environment. The account needs test ETH for creation and transfers; review the maximum cost before signing."
        ]
      ]
    },
    "final": {
      "eyebrow": "Your money, with nine lives",
      "title": "Make every payment land on its feet.",
      "copy": "Help us test an account that is clearer, more useful, and under your control. Use test funds on Arbitrum Sepolia only.",
      "primary": "Open GatoPago",
      "secondary": "Back to the journey"
    },
    "footer": {
      "line": "Your dollars already know how to move. Your account stays under your control.",
      "product": "Product",
      "company": "GatoPago",
      "legal": "Legal",
      "links": [
        "The cycle",
        "The account",
        "Grow",
        "Developers"
      ],
      "terms": "Terms",
      "privacy": "Privacy",
      "status": "V3 · Arbitrum Sepolia · test funds",
      "rights": "GatoPago. Built with care in Bolivia."
    }
  }
} as const;
