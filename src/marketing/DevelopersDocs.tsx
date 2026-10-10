import Link from 'next/link';
import type { Locale } from 'next-intl';
import type { ReactNode } from 'react';
import { CatGlyph } from './CatGlyph';
import { CodeBlock } from './CodeBlock';
import { LanguageLink } from '../lib/LanguageLink';
import { getTranslations } from 'next-intl/server';
import './docs.css';

const STATUSES = ['requires_payment', 'processing', 'succeeded', 'canceled', 'expired'] as const;

const EVENTS = [
  'created',
  'processing',
  'succeeded',
  'duplicate_payment',
  'canceled',
  'expired',
] as const;

const ROUTES = [
  ['createIntent', 'POST /v1/payment_intents'],
  ['listIntents', 'GET /v1/payment_intents'],
  ['readIntent', 'GET /v1/payment_intents/:id'],
  ['cancelIntent', 'POST /v1/payment_intents/:id/cancel'],
  ['simulate', 'POST /v1/payment_intents/:id/simulate'],
  ['listEvents', 'GET /v1/events'],
  ['resendEvent', 'POST /v1/events/:id/resend'],
  ['webhooks', 'GET · POST /v1/webhook_endpoints'],
  ['deleteWebhook', 'DELETE /v1/webhook_endpoints/:id'],
  ['apiKeys', 'GET · POST /v1/api_keys'],
] as const;

const ERRORS = [
  'UNAUTHENTICATED',
  'INVALID_AMOUNT',
  'IDEMPOTENCY_KEY_REUSED',
  'INTENT_NOT_CANCELABLE',
  'RATE_LIMITED',
] as const;

const SECTIONS = ['start', 'auth', 'charge', 'status', 'webhooks', 'reference'] as const;

const code = (chunks: ReactNode) => <code>{chunks}</code>;
const strong = (chunks: ReactNode) => <strong>{chunks}</strong>;

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
export async function DevelopersDocs({
  apiOrigin,
  businessOrigin,
  locale,
}: {
  apiOrigin: string;
  /** GatoPago Business, where merchants create their keys. */
  businessOrigin: string;
  locale: Locale;
}) {
  const t = await getTranslations({ locale, namespace: 'Docs' });
  const en = locale === 'en';
  const consoleHref = businessOrigin;
  const create = `curl -X POST ${apiOrigin}/v1/payment_intents \\
  -H "Authorization: Bearer sk_test_…" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: order-1042" \\
  -d '{
    "amount": "18.00",
    "description": "${t('order')}",
    "metadata": { "order_id": "1042" },
    "expires_in": 3600
  }'`;
  const response = `{
  "id": "pi_3f9c…",
  "object": "payment_intent",
  "amount": "18.00",
  "currency": "USDC",
  "status": "requires_payment",
  "description": "${t('order')}",
  "metadata": { "order_id": "1042" },
  "checkout_url": "https://gatopago.com/pay/pi_3f9c…",
  "expires_at": 1767229200,
  "created_at": 1767225600,
  "livemode": false,
  "payment": null
}`;
  const verify = `import { createHmac, timingSafeEqual } from 'node:crypto';

// ${t('rawBody')}
export function verifyGatoPago(rawBody, header, secret) {
  const { t, v1 } = Object.fromEntries(header.split(',').map((part) => part.split('=')));
  // ${t('oldDeliveries')}
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
            <LanguageLink
              href={en ? '/docs' : '/en/docs'}
              language={en ? 'es' : 'en'}
              className="flex min-h-10 items-center border border-border px-3 font-mono text-[13px]"
            >
              {t('otherLanguage')}
            </LanguageLink>
            <a
              href={consoleHref}
              className="hidden min-h-10 items-center border-2 border-cat-500 bg-cat-500 px-4 text-[14px] font-bold shadow-[3px_3px_0_var(--color-cat-700)] sm:flex"
            >
              {t('openConsole')}
            </a>
          </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-10 lg:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <nav aria-label={t('onThisPage')} className="sticky top-24">
            <p className="mb-3 font-mono text-[11px] tracking-[0.12em] text-text-faint uppercase">
              {t('onThisPage')}
            </p>
            <ul className="space-y-1 text-[14px]">
              {SECTIONS.map((id) => (
                <li key={id}>
                  <a href={`#${id}`} className="block py-1 text-text-muted hover:text-text">
                    {t(`sections.${id}`)}
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
          <h1 className="docs-title text-[34px] leading-[1.05] md:text-[46px]">{t('title')}</h1>
          <p className="mt-4 mb-6 text-[17px] leading-relaxed text-text-muted">{t('lead')}</p>
          <p className="mb-10 border-l-4 border-pending bg-pending/10 px-4 py-3 text-[14px]">
            {t('beta')}
          </p>

          <Section id="start" title={t('sections.start')}>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                {t.rich('stepConsole', {
                  link: (chunks) => (
                    <a href={consoleHref} className="text-info underline">
                      {chunks}
                    </a>
                  ),
                })}
              </li>
              <li>{t.rich('stepCharge', { code })}</li>
              <li>{t.rich('stepWebhook', { code })}</li>
            </ol>
          </Section>

          <Section id="auth" title={t('sections.auth')}>
            <p>{t.rich('auth', { code })}</p>
          </Section>

          <Section id="charge" title={t('sections.charge')}>
            <p>{t.rich('fields', { code })}</p>
            <CodeBlock code={create} label={t('request')} />
            <CodeBlock code={response} label={t('response')} />
            <p>{t.rich('retry', { strong })}</p>
          </Section>

          <Section id="status" title={t('sections.status')}>
            <dl className="divide-y divide-border border border-border bg-surface">
              {STATUSES.map((status) => (
                <div key={status} className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_1fr]">
                  <dt>
                    <code>{status}</code>
                  </dt>
                  <dd className="text-[14px]">{t(`statuses.${status}`)}</dd>
                </div>
              ))}
            </dl>
            <p>{t('simulate')}</p>
          </Section>

          <Section id="webhooks" title={t('sections.webhooks')}>
            <p>{t('webhooks')}</p>
            <CodeBlock code={event} label={t('event')} />
            <dl className="divide-y divide-border border border-border bg-surface">
              {EVENTS.map((type) => (
                <div key={type} className="grid gap-1 px-4 py-3 sm:grid-cols-[260px_1fr]">
                  <dt>
                    <code>payment_intent.{type}</code>
                  </dt>
                  <dd className="text-[14px]">{t(`events.${type}`)}</dd>
                </div>
              ))}
            </dl>
            <p>
              {t.rich('verify', {
                strong,
                code,
                format: 't=<unix>,v1=<hex>',
                payload: '<t>.<body>',
              })}
            </p>
            <CodeBlock code={verify} label="Node.js" />
          </Section>

          <Section id="reference" title={t('sections.reference')}>
            <p>{t.rich('baseUrl', { code, origin: apiOrigin })}</p>
            <div className="overflow-x-auto border border-border bg-surface">
              <table className="w-full min-w-[520px] text-left text-[14px]">
                <tbody className="divide-y divide-border">
                  {ROUTES.map(([id, route]) => (
                    <tr key={route}>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <code>{route}</code>
                      </td>
                      <td className="px-4 py-2.5">{t(`routes.${id}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>{t.rich('errorsIntro', { code })}</p>
            <dl className="divide-y divide-border border border-border bg-surface">
              {ERRORS.map((error) => (
                <div key={error} className="grid gap-1 px-4 py-3 sm:grid-cols-[240px_1fr]">
                  <dt>
                    <code>{error}</code>
                  </dt>
                  <dd className="text-[14px]">{t(`errors.${error}`)}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <div className="mt-12 flex flex-wrap items-center gap-4 border-t border-border pt-8">
            <a
              href={consoleHref}
              className="flex min-h-12 items-center border-2 border-cat-500 bg-cat-500 px-5 font-bold shadow-[4px_4px_0_var(--color-cat-700)]"
            >
              {t('createKey')}
            </a>
            <Link href={en ? '/en' : '/'} className="text-[14px] text-text-muted underline">
              {t('back')}
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
