import type { Metadata } from 'next';
import Link from 'next/link';
import { settings } from '../../../lib/settings';

export const metadata: Metadata = { title: 'GatoPago — Developers' };
export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const en = (await searchParams).lang === 'en';
  const example = `POST ${settings.apiOrigin}/v1/payment_intents
Authorization: Bearer <API_KEY>
Content-Type: application/json
Idempotency-Key: cafe-norte-order-001

{
  "amount": "18.00",
  "currency": "USDC",
  "reference": "cafe-norte-order-001"
}`;
  return (
    <main className="web-notice">
      <Link href={en ? '/en#api' : '/#api'}>{en ? 'Back to GatoPago' : 'Volver a GatoPago'}</Link>
      <h1>GatoPago Developers</h1>
      <p>
        {en
          ? 'Integrate commercial payments with GatoPago Flow.'
          : 'Integra pagos comerciales con GatoPago Flow.'}
      </p>
      <h2>{en ? 'Create a payment intent' : 'Crear una intención de pago'}</h2>
      <p>
        {en
          ? 'Use an active merchant and a commercial API key whose mode matches the settlement network. Keep the key on your server.'
          : 'Usa un comercio activo y una API key comercial cuyo modo coincida con la red de liquidación. Guarda la clave en tu servidor.'}
      </p>
      <pre style={{ overflowX: 'auto', padding: '1rem', border: '1px solid currentColor' }}>
        <code>{example}</code>
      </pre>
      <h2>{en ? 'API routes' : 'Rutas de la API'}</h2>
      <ul>
        <li>
          <code>POST /v1/payment_intents</code> —{' '}
          {en ? 'Create an intent.' : 'Crear una intención.'}
        </li>
        <li>
          <code>GET /v1/payment_intents/:id</code> —{' '}
          {en ? 'Read its current state.' : 'Consultar su estado actual.'}
        </li>
        <li>
          <code>POST /v1/payment_intents/:id/cancel</code> —{' '}
          {en ? 'Request cancellation.' : 'Solicitar cancelación.'}
        </li>
        <li>
          <code>/v1/payment_links</code> —{' '}
          {en
            ? 'Payment links; creating and listing require an authenticated session.'
            : 'Enlaces de pago; crear y listar requieren una sesión autenticada.'}
        </li>
        <li>
          <code>/checkout/v1/:linkId</code> —{' '}
          {en ? 'Checkout for a specific payment link.' : 'Checkout de un enlace de pago concreto.'}
        </li>
        <li>
          <code>/v1/events</code> — {en ? 'Commercial events.' : 'Eventos comerciales.'}
        </li>
      </ul>
      <p>
        {en
          ? 'Reuse the same idempotency key when recovering the same request after a lost response. Consult the payment state before creating a replacement.'
          : 'Conserva la misma clave de idempotencia al recuperar una solicitud cuya respuesta se perdió. Consulta el estado del pago antes de crear otro para reemplazarlo.'}
      </p>
      <Link href={en ? '/business?lang=en' : '/business'}>
        {en ? 'Open the merchant dashboard' : 'Abrir el panel de comercios'}
      </Link>
    </main>
  );
}
