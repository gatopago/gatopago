import Link from 'next/link';
import type { ReactNode } from 'react';
import { CatGlyph } from './CatGlyph';
import { CodeBlock } from './CodeBlock';
import './docs.css';

const STATUSES: [status: string, es: string, en: string][] = [
  ['requires_payment', 'Esperando el pago.', 'Waiting for payment.'],
  [
    'processing',
    'Pagado desde otra red; Circle está entregando los USDC en tu red.',
    'Paid from another network; Circle is delivering the USDC to yours.',
  ],
  ['succeeded', 'Pagado: el dinero ya está en tu cuenta.', 'Paid: the money is in your account.'],
  ['canceled', 'Lo cancelaste antes de que se pagara.', 'You canceled it before it was paid.'],
  [
    'expired',
    'Venció sin pagarse (por defecto, a las 24 horas).',
    'It expired unpaid (after 24 hours by default).',
  ],
];

const EVENTS: [type: string, es: string, en: string][] = [
  ['payment_intent.created', 'Se creó un cobro.', 'A charge was created.'],
  [
    'payment_intent.processing',
    'Se pagó desde otra red y está en camino.',
    'It was paid from another network and is on its way.',
  ],
  ['payment_intent.succeeded', 'Se pagó: entrega el pedido.', 'It was paid: deliver the order.'],
  [
    'payment_intent.duplicate_payment',
    'Llegó un segundo pago para un cobro ya pagado.',
    'A second payment arrived for a charge already paid.',
  ],
  ['payment_intent.canceled', 'Se canceló.', 'It was canceled.'],
  ['payment_intent.expired', 'Venció sin pagarse.', 'It expired unpaid.'],
];

const ROUTES: [route: string, es: string, en: string][] = [
  ['POST /v1/payment_intents', 'Crea un cobro.', 'Creates a charge.'],
  ['GET /v1/payment_intents', 'Lista los últimos 100.', 'Lists the latest 100.'],
  ['GET /v1/payment_intents/:id', 'Lee uno.', 'Reads one.'],
  ['POST /v1/payment_intents/:id/cancel', 'Cancela uno sin pagar.', 'Cancels an unpaid one.'],
  [
    'POST /v1/payment_intents/:id/simulate',
    'Lo marca como pagado (solo en redes de prueba).',
    'Marks it as paid (test networks only).',
  ],
  ['GET /v1/events', 'Eventos y cómo fue cada entrega.', 'Events and how each delivery went.'],
  ['POST /v1/events/:id/resend', 'Reenvía un evento.', 'Sends an event again.'],
  [
    'GET · POST /v1/webhook_endpoints',
    'Lista o registra URLs de webhooks.',
    'Lists or registers webhook URLs.',
  ],
  ['DELETE /v1/webhook_endpoints/:id', 'Quita una URL.', 'Removes a URL.'],
  [
    'GET · POST /v1/api_keys',
    'Claves API: solo desde la consola.',
    'API keys: from the console only.',
  ],
];

const ERRORS: [code: string, es: string, en: string][] = [
  [
    'UNAUTHENTICATED',
    'Falta la clave o no es válida (401).',
    'The key is missing or invalid (401).',
  ],
  [
    'INVALID_AMOUNT',
    'El monto no es un decimal válido mayor a cero (400).',
    'The amount is not a valid decimal above zero (400).',
  ],
  [
    'IDEMPOTENCY_KEY_REUSED',
    'Usaste la misma Idempotency-Key con otros datos (409).',
    'You used the same Idempotency-Key with other data (409).',
  ],
  [
    'INTENT_NOT_CANCELABLE',
    'El cobro ya se pagó, venció o se canceló (409).',
    'The charge was already paid, expired or canceled (409).',
  ],
  [
    'RATE_LIMITED',
    'Demasiadas solicitudes; reintenta luego (429).',
    'Too many requests; retry later (429).',
  ],
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      id={id}
      className="scroll-mt-24 border-t border-border pt-10 pb-4 first:border-0 first:pt-0"
    >
      <h2 className="docs-title mb-4 text-[26px] leading-tight">{title}</h2>
      <div className="space-y-4 text-[15px] leading-relaxed text-text-muted [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[13px] [&_:not(pre)>code]:text-text [&_strong]:text-text">
        {children}
      </div>
    </section>
  );
}

/** `/docs`: GatoPago Flow's API, from the first charge to verifying webhooks. */
export function DevelopersDocs({
  apiOrigin,
  businessOrigin,
  english: en,
}: {
  apiOrigin: string;
  /** GatoPago Business, where merchants create their keys. */
  businessOrigin: string;
  english: boolean;
}) {
  const consoleHref = businessOrigin;
  const toc: [string, string][] = en
    ? [
        ['start', 'Quick start'],
        ['auth', 'Authentication'],
        ['charge', 'Create a charge'],
        ['status', 'Statuses'],
        ['webhooks', 'Webhooks'],
        ['reference', 'Reference'],
      ]
    : [
        ['start', 'Primeros pasos'],
        ['auth', 'Autenticación'],
        ['charge', 'Crear un cobro'],
        ['status', 'Estados'],
        ['webhooks', 'Webhooks'],
        ['reference', 'Referencia'],
      ];
  const create = `curl -X POST ${apiOrigin}/v1/payment_intents \\
  -H "Authorization: Bearer sk_test_…" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: order-1042" \\
  -d '{
    "amount": "18.00",
    "description": "${en ? 'Order 1042' : 'Pedido 1042'}",
    "metadata": { "order_id": "1042" },
    "expires_in": 3600
  }'`;
  const response = `{
  "id": "pi_3f9c…",
  "object": "payment_intent",
  "amount": "18.00",
  "currency": "USDC",
  "status": "requires_payment",
  "description": "${en ? 'Order 1042' : 'Pedido 1042'}",
  "metadata": { "order_id": "1042" },
  "checkout_url": "https://gatopago.com/pay/pi_3f9c…",
  "expires_at": 1767229200,
  "created_at": 1767225600,
  "livemode": false,
  "payment": null
}`;
  const verify = `import { createHmac, timingSafeEqual } from 'node:crypto';

// ${en ? 'Use the raw body, exactly as it arrived.' : 'Usa el cuerpo crudo, tal como llegó.'}
export function verifyGatoPago(rawBody, header, secret) {
  const { t, v1 } = Object.fromEntries(header.split(',').map((part) => part.split('=')));
  // ${en ? 'Reject old deliveries (5 minutes).' : 'Rechaza entregas viejas (5 minutos).'}
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = createHmac('sha256', secret).update(\`\${t}.\${rawBody}\`).digest('hex');
  return v1.length === expected.length && timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
}`;
  const event = `{
  "id": "evt_…",
  "object": "event",
  "type": "payment_intent.succeeded",
  "created_at": 1767226000,
  "data": { "id": "pi_3f9c…", "status": "succeeded", "amount": "18.00", "…": "…" }
}`;

  return (
    <div className="min-h-dvh bg-canvas text-text">
      <header className="sticky top-0 z-10 border-b border-border bg-canvas/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <Link href={en ? '/en#api' : '/#api'} className="flex items-center gap-2.5">
            <CatGlyph className="w-7" decorative />
            <span className="font-display text-[17px] font-bold">GatoPago</span>
            <span className="border border-border px-1.5 py-0.5 font-mono text-[10px] tracking-[0.1em] text-cat-700 uppercase">
              Developers
            </span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              href={en ? '/docs' : '/en/docs'}
              hrefLang={en ? 'es' : 'en'}
              className="flex min-h-10 items-center border border-border px-3 font-mono text-[13px]"
            >
              {en ? 'ES' : 'EN'}
            </Link>
            <a
              href={consoleHref}
              className="hidden min-h-10 items-center border-2 border-cat-500 bg-cat-500 px-4 text-[14px] font-bold shadow-[3px_3px_0_var(--color-cat-700)] sm:flex"
            >
              {en ? 'Open the console' : 'Abrir la consola'}
            </a>
          </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-10 lg:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <nav aria-label={en ? 'On this page' : 'En esta página'} className="sticky top-24">
            <p className="mb-3 font-mono text-[11px] tracking-[0.12em] text-text-faint uppercase">
              {en ? 'On this page' : 'En esta página'}
            </p>
            <ul className="space-y-1 text-[14px]">
              {toc.map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`} className="block py-1 text-text-muted hover:text-text">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <main id="main-content" className="min-w-0 max-w-3xl">
          <p className="mb-3 font-mono text-[11px] tracking-[0.12em] text-cat-700 uppercase">
            GatoPago Flow · API
          </p>
          <h1 className="docs-title text-[34px] leading-[1.05] md:text-[46px]">
            {en ? 'Get paid in USDC from your server' : 'Cobra en USDC desde tu servidor'}
          </h1>
          <p className="mt-4 mb-6 text-[17px] leading-relaxed text-text-muted">
            {en
              ? 'Create a charge, share its link or QR, and receive a signed webhook when it is paid. Your customer pays from GatoPago or from any wallet, and the money reaches your account directly: GatoPago never holds it.'
              : 'Crea un cobro, comparte su link o QR y recibe un webhook firmado cuando se paga. Tu cliente paga desde GatoPago o desde cualquier wallet, y el dinero llega directo a tu cuenta: GatoPago nunca lo custodia.'}
          </p>
          <p className="mb-10 border-l-4 border-pending bg-pending/10 px-4 py-3 text-[14px]">
            {en
              ? 'Public beta on test networks: use test keys (sk_test_…) and test USDC.'
              : 'Beta pública en redes de prueba: usa claves de prueba (sk_test_…) y USDC de prueba.'}
          </p>

          <Section id="start" title={toc[0][1]}>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                {en ? 'Open the ' : 'Abre la '}
                <a href={consoleHref} className="text-info underline">
                  {en ? 'console' : 'consola'}
                </a>
                {en
                  ? ' with your GatoPago account and create an API key.'
                  : ' con tu cuenta GatoPago y crea una clave API.'}
              </li>
              <li>
                {en
                  ? 'Create a charge from your server and send your customer its '
                  : 'Crea un cobro desde tu servidor y envía a tu cliente su '}
                <code>checkout_url</code>.
              </li>
              <li>
                {en
                  ? 'Register a webhook URL and deliver the order when '
                  : 'Registra una URL de webhook y entrega el pedido cuando llegue '}
                <code>payment_intent.succeeded</code>
                {en ? ' arrives.' : '.'}
              </li>
            </ol>
          </Section>

          <Section id="auth" title={toc[1][1]}>
            <p>
              {en ? 'Every request carries your key: ' : 'Cada solicitud lleva tu clave: '}
              <code>Authorization: Bearer sk_test_…</code>.{' '}
              {en
                ? 'It creates charges in your name, so keep it on your server, never in an app or a web page. If it leaks, revoke it in the console and create another.'
                : 'Con ella se crean cobros a tu nombre: guárdala en tu servidor, nunca en una app ni en una página web. Si se filtra, revócala en la consola y crea otra.'}
            </p>
          </Section>

          <Section id="charge" title={toc[2][1]}>
            <p>
              {en ? 'Only ' : 'Solo '}
              <code>amount</code>
              {en
                ? ' is required: a decimal in USDC with up to 6 decimals. '
                : ' es obligatorio: un decimal en USDC con hasta 6 decimales. '}
              <code>description</code>
              {en
                ? ' (up to 200 characters) is shown to the payer; '
                : ' (hasta 200 caracteres) la ve quien paga; '}
              <code>metadata</code>
              {en
                ? ' (up to 20 text values) is for you; '
                : ' (hasta 20 valores de texto) es para ti; '}
              <code>expires_in</code>
              {en
                ? ' is in seconds, from 5 minutes to 7 days (24 hours by default).'
                : ' va en segundos, de 5 minutos a 7 días (24 horas por defecto).'}
            </p>
            <CodeBlock code={create} label={en ? 'Request' : 'Solicitud'} english={en} />
            <CodeBlock
              code={response}
              label={en ? 'Response · 201' : 'Respuesta · 201'}
              english={en}
            />
            <p>
              <strong>{en ? 'Retry safely: ' : 'Reintenta sin miedo: '}</strong>
              {en
                ? 'with the same Idempotency-Key and the same data you get the same charge back, never a second one. If the response was lost, repeat the request before creating another.'
                : 'con la misma Idempotency-Key y los mismos datos recibes el mismo cobro, nunca uno segundo. Si la respuesta se perdió, repite la solicitud antes de crear otro.'}
            </p>
          </Section>

          <Section id="status" title={toc[3][1]}>
            <dl className="divide-y divide-border border border-border bg-surface">
              {STATUSES.map(([status, es, english]) => (
                <div key={status} className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_1fr]">
                  <dt>
                    <code>{status}</code>
                  </dt>
                  <dd className="text-[14px]">{en ? english : es}</dd>
                </div>
              ))}
            </dl>
            <p>
              {en
                ? 'On test networks, POST /v1/payment_intents/:id/simulate marks a charge as paid, so you can try your webhook without paying.'
                : 'En redes de prueba, POST /v1/payment_intents/:id/simulate marca un cobro como pagado, así pruebas tu webhook sin pagar.'}
            </p>
          </Section>

          <Section id="webhooks" title={toc[4][1]}>
            <p>
              {en
                ? 'Register your URL in the console. GatoPago sends each event with a POST and retries failed deliveries up to 10 times; answer with a 2xx as soon as you receive it.'
                : 'Registra tu URL en la consola. GatoPago envía cada evento con un POST y reintenta las entregas fallidas hasta 10 veces; responde con un 2xx apenas lo recibas.'}
            </p>
            <CodeBlock code={event} label={en ? 'Event' : 'Evento'} english={en} />
            <dl className="divide-y divide-border border border-border bg-surface">
              {EVENTS.map(([type, es, english]) => (
                <div key={type} className="grid gap-1 px-4 py-3 sm:grid-cols-[260px_1fr]">
                  <dt>
                    <code>{type}</code>
                  </dt>
                  <dd className="text-[14px]">{en ? english : es}</dd>
                </div>
              ))}
            </dl>
            <p>
              <strong>{en ? 'Verify every event. ' : 'Verifica cada evento. '}</strong>
              {en ? 'The ' : 'El encabezado '}
              <code>GatoPago-Signature</code>
              {en ? ' header is ' : ' es '}
              <code>t=&lt;unix&gt;,v1=&lt;hex&gt;</code>
              {en ? ': an HMAC-SHA256 of ' : ': un HMAC-SHA256 de '}
              <code>{'<t>.<body>'}</code>
              {en
                ? ' with your endpoint’s secret (whsec_…), which the console shows once.'
                : ' con el secreto de tu endpoint (whsec_…), que la consola muestra una sola vez.'}
            </p>
            <CodeBlock code={verify} label="Node.js" english={en} />
          </Section>

          <Section id="reference" title={toc[5][1]}>
            <p>
              {en ? 'Base URL: ' : 'URL base: '}
              <code>{apiOrigin}</code>
            </p>
            <div className="overflow-x-auto border border-border bg-surface">
              <table className="w-full min-w-[520px] text-left text-[14px]">
                <tbody className="divide-y divide-border">
                  {ROUTES.map(([route, es, english]) => (
                    <tr key={route}>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <code>{route}</code>
                      </td>
                      <td className="px-4 py-2.5">{en ? english : es}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              {en
                ? 'Errors answer with an HTTP status and a stable code in '
                : 'Los errores responden con un estado HTTP y un código estable en '}
              <code>error_code</code>:
            </p>
            <dl className="divide-y divide-border border border-border bg-surface">
              {ERRORS.map(([code, es, english]) => (
                <div key={code} className="grid gap-1 px-4 py-3 sm:grid-cols-[240px_1fr]">
                  <dt>
                    <code>{code}</code>
                  </dt>
                  <dd className="text-[14px]">{en ? english : es}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <div className="mt-12 flex flex-wrap items-center gap-4 border-t border-border pt-8">
            <a
              href={consoleHref}
              className="flex min-h-12 items-center border-2 border-cat-500 bg-cat-500 px-5 font-bold shadow-[4px_4px_0_var(--color-cat-700)]"
            >
              {en ? 'Create my API key' : 'Crear mi clave API'}
            </a>
            <Link href={en ? '/en' : '/'} className="text-[14px] text-text-muted underline">
              {en ? 'Back to GatoPago' : 'Volver a GatoPago'}
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
