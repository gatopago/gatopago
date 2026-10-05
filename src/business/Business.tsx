'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { parseUnits } from 'viem';
import { walletNetwork } from '@gatopago/shared/networks';
import { NavigationLink } from '../consumer/NavigationLink';
import { BackHeader, NoticeCard } from '../consumer/Primitives';
import { localizedPath } from '../consumer/routes';
import { SelectMenu } from '../consumer/SelectMenu';
import { RowSkeletonList } from '../consumer/Skeleton';
import type { ClientSettings } from '../lib/settings';
import { explorerUrl, networkName, USDC_DECIMALS } from '../wallet/account';
import { formatUsdc } from '../wallet/balances';
import { flowApi, type Intent } from '../wallet/flow';
import { failureMessage } from '../wallet/messages';
import type { Session } from '../wallet/session';

type Props = { settings: ClientSettings; session: Session; english: boolean };
type Section = 'overview' | 'payments' | 'keys' | 'webhooks' | 'events';

const SECTIONS: [Section, string, string, string][] = [
  ['overview', '/business', 'Resumen', 'Overview'],
  ['payments', '/business/payments', 'Cobros', 'Payments'],
  ['keys', '/business/keys', 'Claves API', 'API keys'],
  ['webhooks', '/business/webhooks', 'Webhooks', 'Webhooks'],
  ['events', '/business/events', 'Eventos', 'Events'],
];

/** Loads `path` from Flow on mount and whenever `revision` changes. */
function useFlow<T>({ settings, session, english: en }: Props, path: string, revision = 0) {
  const [state, setState] = useState<{ data: T | null; error: string }>({ data: null, error: '' });
  useEffect(() => {
    const controller = new AbortController();
    flowApi<T>(settings, session, path, { signal: controller.signal })
      .then((data) => setState({ data, error: '' }))
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setState({ data: null, error: failureMessage(failure, en) });
      });
    return () => controller.abort();
  }, [settings, session, en, path, revision]);
  return state;
}

const date = (seconds: number, en: boolean) =>
  new Date(seconds * 1000).toLocaleString(en ? 'en' : 'es', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

const copy = (value: string) => void navigator.clipboard.writeText(value).catch(() => undefined);

function statusLabel(status: Intent['status'], en: boolean) {
  return {
    requires_payment: [en ? 'Awaiting payment' : 'Esperando pago', 'bg-pending/10 text-pending'],
    processing: [en ? 'Processing' : 'En proceso', 'bg-info/10 text-info'],
    succeeded: [en ? 'Paid' : 'Pagado', 'bg-growth/15 text-growth'],
    canceled: [en ? 'Canceled' : 'Cancelado', 'bg-surface-2 text-text-faint'],
    expired: [en ? 'Expired' : 'Vencido', 'bg-surface-2 text-text-faint'],
  }[status];
}

function Status({ status, english: en }: { status: Intent['status']; english: boolean }) {
  const [label, tone] = statusLabel(status, en);
  return <span className={`meli-chip shrink-0 ${tone}`}>{label}</span>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-2.5 last:border-0">
      <span className="shrink-0 text-[13px] text-text-muted">{label}</span>
      <span className="break-all text-right text-[13px] text-text">{children}</span>
    </div>
  );
}

/** A secret shown once, as Flow returns it only when it is created. */
function OneTimeSecret({ value, english: en }: { value: string; english: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <NoticeCard
      tone="warning"
      className="mb-5"
      title={
        en ? 'Copy it now: it will not be shown again' : 'Cópiala ahora: no se volverá a mostrar'
      }
    >
      <code className="mt-2 block break-all font-mono text-[12px] text-text">{value}</code>
      <button
        type="button"
        className="btn btn-ghost btn-sm mt-3"
        onClick={() => {
          copy(value);
          setCopied(true);
        }}
      >
        {copied ? (en ? 'Copied' : 'Copiada') : en ? 'Copy' : 'Copiar'}
      </button>
    </NoticeCard>
  );
}

/** `/business/...`: the member's GatoPago Flow merchant console (former dashboard). */
export function Business(props: Props) {
  const { english: en } = props;
  const parts = usePathname().split('/').filter(Boolean);
  const section = (SECTIONS.find(([, path]) => path === `/${parts.slice(0, 2).join('/')}`)?.[0] ??
    'overview') as Section;
  const paymentId = section === 'payments' ? parts[2] : undefined;
  return (
    <>
      <BackHeader title={en ? 'Business' : 'Negocios'} english={en} to="/settings" />
      <nav
        aria-label={en ? 'Business sections' : 'Secciones de negocios'}
        className="-mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1"
      >
        {SECTIONS.map(([key, path, es, english]) => (
          <NavigationLink
            key={key}
            href={localizedPath(path, en)}
            aria-current={section === key ? 'page' : undefined}
            className={`shrink-0 border px-3 py-2 font-mono text-[11px] uppercase tracking-[0.06em] ${section === key ? 'border-text bg-cat-500 text-on-cat shadow-[3px_3px_0_var(--color-cat-700)]' : 'border-border bg-surface text-text-muted'}`}
          >
            {en ? english : es}
          </NavigationLink>
        ))}
      </nav>
      {section === 'overview' ? <Overview {...props} /> : null}
      {section === 'payments' ? (
        paymentId ? (
          <PaymentDetail {...props} id={paymentId} />
        ) : (
          <Payments {...props} />
        )
      ) : null}
      {section === 'keys' ? <ApiKeys {...props} /> : null}
      {section === 'webhooks' ? <Webhooks {...props} /> : null}
      {section === 'events' ? <Events {...props} /> : null}
    </>
  );
}

function Overview(props: Props) {
  const { settings, session, english: en } = props;
  const merchant = useFlow<{ id: string; name: string | null; address: string }>(props, 'merchant');
  const keys = useFlow<{ data: unknown[] }>(props, 'api_keys');
  const hooks = useFlow<{ data: unknown[] }>(props, 'webhook_endpoints');
  const [name, setName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false),
    [notice, setNotice] = useState('');
  const shownName = name ?? merchant.data?.name ?? '';
  const curl = `curl -X POST ${settings.apiOrigin}/v1/payment_intents \\
  -H "Authorization: Bearer sk_test_…" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: order-A-1042" \\
  -d '{"amount":"25.00","description":"Order A-1042"}'`;
  return (
    <div className="animate-fade-up">
      <header className="mb-6">
        <p className="meli-kicker mb-3">GatoPago Flow</p>
        <h1 className="font-display text-[32px] leading-[.98]">
          {en ? 'Start getting paid' : 'Empieza a cobrar'}
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-text-muted">
          {en
            ? 'Accept USDC from any wallet or GatoPago account, on any supported network.'
            : 'Recibe USDC desde cualquier wallet o cuenta GatoPago, en cualquier red admitida.'}
        </p>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <NavigationLink
          href={localizedPath('/business/keys', en)}
          className="meli-paper-card interactive-surface p-4"
        >
          <p className="type-mono text-[28px] font-bold">{keys.data?.data.length ?? '—'}</p>
          <p className="text-[13px] text-text-muted">{en ? 'API keys' : 'Claves API'}</p>
        </NavigationLink>
        <NavigationLink
          href={localizedPath('/business/webhooks', en)}
          className="meli-paper-card interactive-surface p-4"
        >
          <p className="type-mono text-[28px] font-bold">{hooks.data?.data.length ?? '—'}</p>
          <p className="text-[13px] text-text-muted">Webhooks</p>
        </NavigationLink>
      </div>

      <form
        className="meli-paper-card meli-paper-card--strong mb-5 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          setSaving(true);
          setNotice('');
          flowApi(settings, session, 'merchant', { body: { name: shownName } })
            .then(() => setNotice(en ? 'Name saved' : 'Nombre guardado'))
            .catch((failure: unknown) => setNotice(failureMessage(failure, en)))
            .finally(() => setSaving(false));
        }}
      >
        <label htmlFor="merchant-name" className="mb-1.5 block text-[12px] text-text-faint">
          {en ? 'Name your customers see when paying' : 'Nombre que ven tus clientes al pagar'}
        </label>
        <input
          id="merchant-name"
          required
          maxLength={60}
          value={shownName}
          onChange={(event) => setName(event.target.value)}
          className="meli-field mb-3 h-12 text-[14px]"
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || !shownName.trim()}
            className="btn btn-primary btn-sm"
          >
            {saving ? (en ? 'Saving…' : 'Guardando…') : en ? 'Save' : 'Guardar'}
          </button>
          {notice ? (
            <span role="status" className="text-[12px] text-text-muted">
              {notice}
            </span>
          ) : null}
        </div>
        {merchant.data ? (
          <p className="mt-4 text-[12px] leading-relaxed text-text-faint">
            {en
              ? `Payments settle to your GatoPago account on ${networkName(settings.homeNetwork)}: `
              : `Los cobros llegan a tu cuenta GatoPago en ${networkName(settings.homeNetwork)}: `}
            <code className="font-mono">
              {merchant.data.address.slice(0, 6)}…{merchant.data.address.slice(-4)}
            </code>
            {en
              ? '. No custody: the money is yours from the first second.'
              : '. Sin custodia: el dinero es tuyo desde el primer segundo.'}
          </p>
        ) : null}
      </form>

      <ol className="meli-paper-card mb-5 flex flex-col gap-4 p-5">
        {[
          [
            en ? 'Create an API key' : 'Crea una clave API',
            <>
              {en ? 'In ' : 'En '}
              <NavigationLink
                href={localizedPath('/business/keys', en)}
                className="text-info underline"
              >
                {en ? 'API keys' : 'Claves API'}
              </NavigationLink>
              .
            </>,
          ],
          [
            en ? 'Create a charge' : 'Crea un cobro',
            <>
              <pre className="my-2 overflow-x-auto border border-border bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-text-muted">
                {curl}
              </pre>
              {en ? 'It returns a ' : 'Te devuelve un '}
              <code className="font-mono">checkout_url</code>
              {en ? ' (link or QR) to share.' : ' (link o QR) para compartir.'}
            </>,
          ],
          [
            en ? 'Receive the webhook' : 'Recibe el webhook',
            <>
              {en ? 'Register your URL in ' : 'Registra tu URL en '}
              <NavigationLink
                href={localizedPath('/business/webhooks', en)}
                className="text-info underline"
              >
                Webhooks
              </NavigationLink>
              {en ? '. When paid, you get a signed ' : '. Al pagarse, te llega '}
              <code className="font-mono">payment_intent.succeeded</code>
              {en ? '.' : ' firmado.'}
            </>,
          ],
        ].map(([title, body], index) => (
          <li key={index} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center border-2 border-text bg-cat-500 font-display text-[13px] text-on-cat">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px]">{title}</p>
              <div className="text-[13px] leading-relaxed text-text-muted">{body}</div>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-[13px] text-text-muted">
        {en ? 'The full API reference is in the ' : 'La referencia completa de la API está en la '}
        <NavigationLink href={localizedPath('/docs', en)} className="text-info underline">
          {en ? 'documentation' : 'documentación'}
        </NavigationLink>
        .
      </p>
    </div>
  );
}

function Payments(props: Props) {
  const { english: en } = props;
  const { data, error } = useFlow<{ data: Intent[] }>(props, 'payment_intents');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const intents = (data?.data ?? []).filter(
    (intent) =>
      (status === 'all' || intent.status === status) &&
      (!query ||
        intent.id.includes(query) ||
        (intent.description ?? '').toLowerCase().includes(query)),
  );
  return (
    <div className="animate-fade-up">
      <div className="mb-5 flex flex-col gap-2.5">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={
            en ? 'Search by id (pi_…) or description' : 'Buscar por id (pi_…) o descripción'
          }
          aria-label={en ? 'Search by id or description' : 'Buscar por id o descripción'}
          autoComplete="off"
          spellCheck={false}
          className="meli-field h-12 text-[14px]"
        />
        <SelectMenu
          label={en ? 'Filter by status' : 'Filtrar por estado'}
          showLabel={false}
          value={status}
          options={[
            { value: 'all', label: en ? 'All statuses' : 'Todos los estados' },
            ...(
              ['succeeded', 'requires_payment', 'processing', 'expired', 'canceled'] as const
            ).map((value) => ({ value, label: statusLabel(value, en)[0] })),
          ]}
          onChange={setStatus}
          english={en}
        />
      </div>
      {error ? (
        <p role="alert" className="auth-error">
          {error}
        </p>
      ) : !data ? (
        <RowSkeletonList count={6} />
      ) : intents.length === 0 ? (
        <p className="py-10 text-center text-[14px] text-text-muted">
          {query || status !== 'all'
            ? en
              ? 'No charge matches the filters.'
              : 'Ningún cobro coincide con los filtros.'
            : en
              ? 'No charges yet.'
              : 'Todavía no hay cobros.'}
        </p>
      ) : (
        <div className="meli-paper-card divide-y divide-border">
          {intents.map((intent) => (
            <NavigationLink
              key={intent.id}
              href={localizedPath(`/business/payments/${intent.id}`, en)}
              className="flex items-center gap-3 px-4 py-3.5"
            >
              <div className="min-w-0 flex-1">
                <p className="type-mono text-[15px] font-semibold">
                  {formatUsdc(parseUnits(intent.amount, USDC_DECIMALS))} USDC
                </p>
                <p className="truncate text-[12px] text-text-faint">
                  {date(intent.created_at, en)}
                  {intent.description ? ` · ${intent.description}` : ''}
                </p>
              </div>
              <Status status={intent.status} english={en} />
            </NavigationLink>
          ))}
        </div>
      )}
      {data && data.data.length >= 100 ? (
        <p className="mt-3 text-center text-[12px] text-text-faint">
          {en ? 'Showing the latest 100 charges.' : 'Se muestran los últimos 100 cobros.'}
        </p>
      ) : null}
    </div>
  );
}

function PaymentDetail(props: Props & { id: string }) {
  const { settings, session, english: en, id } = props;
  const [revision, setRevision] = useState(0);
  const { data: intent, error } = useFlow<Intent>(props, `payment_intents/${id}`, revision);
  const [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const testnet = walletNetwork(settings.homeNetwork).chain.testnet;
  const act = (action: 'cancel' | 'simulate') => {
    setBusy(true);
    setActionError('');
    flowApi(settings, session, `payment_intents/${id}/${action}`, { body: {} })
      .then(() => setRevision((value) => value + 1))
      .catch((failure: unknown) => setActionError(failureMessage(failure, en)))
      .finally(() => {
        setBusy(false);
        setConfirmCancel(false);
      });
  };
  if (error)
    return (
      <p role="alert" className="auth-error">
        {error}
      </p>
    );
  if (!intent) return <RowSkeletonList count={4} />;
  const payment = intent.payment;
  const receipt =
    payment?.transaction_hash && explorerUrl(payment.network, payment.transaction_hash);
  return (
    <div className="animate-fade-up flex flex-col gap-5">
      <NavigationLink
        href={localizedPath('/business/payments', en)}
        className="text-[13px] text-info"
      >
        ← {en ? 'Payments' : 'Cobros'}
      </NavigationLink>
      <section className="meli-paper-card meli-paper-card--strong p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="type-mono text-[28px] font-bold">
            {formatUsdc(parseUnits(intent.amount, USDC_DECIMALS))} USDC
          </span>
          <Status status={intent.status} english={en} />
        </div>
        <Row label="ID">
          <button
            type="button"
            onClick={() => copy(intent.id)}
            className="break-all text-right font-mono"
          >
            {intent.id}
          </button>
        </Row>
        {intent.description ? (
          <Row label={en ? 'Description' : 'Descripción'}>{intent.description}</Row>
        ) : null}
        <Row label={en ? 'Created' : 'Creado'}>{date(intent.created_at, en)}</Row>
        {intent.status === 'requires_payment' ? (
          <Row label={en ? 'Expires' : 'Vence'}>{date(intent.expires_at, en)}</Row>
        ) : null}
        {payment ? (
          <>
            <Row label={en ? 'Paid on' : 'Pagado en'}>{networkName(payment.network)}</Row>
            {payment.paid_at ? (
              <Row label={en ? 'Paid at' : 'Fecha de pago'}>{date(payment.paid_at, en)}</Row>
            ) : null}
            {payment.payer ? (
              <Row label={en ? 'Payer' : 'Pagador'}>
                <code className="font-mono">{payment.payer}</code>
              </Row>
            ) : null}
            {receipt ? (
              <Row label={en ? 'Transaction' : 'Transacción'}>
                <a
                  href={receipt}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-info underline"
                >
                  {payment.transaction_hash!.slice(0, 10)}…{payment.transaction_hash!.slice(-8)} ↗
                </a>
              </Row>
            ) : null}
          </>
        ) : null}
      </section>

      {intent.status === 'requires_payment' ? (
        <section className="meli-paper-card p-5">
          <h2 className="mb-1 font-display text-[17px]">
            {en ? 'Get paid in person' : 'Cobrar en persona'}
          </h2>
          <p className="mb-4 text-[13px] text-text-muted">
            {en
              ? 'Show this QR to the customer or share the checkout link.'
              : 'Muestra este QR al cliente o comparte el link del checkout.'}
          </p>
          <div className="mb-4 flex justify-center">
            <div className="border-2 border-text bg-white p-3 shadow-[6px_6px_0_var(--color-cat-700)]">
              <QRCodeSVG
                value={intent.checkout_url}
                size={176}
                bgColor="#ffffff"
                fgColor="#0A0A0B"
                level="M"
              />
            </div>
          </div>
          <div className="flex gap-2.5">
            <a
              href={intent.checkout_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary btn-sm flex-1"
            >
              {en ? 'Open checkout' : 'Abrir checkout'}
            </a>
            <button
              type="button"
              onClick={() => copy(intent.checkout_url)}
              className="btn btn-ghost btn-sm flex-1"
            >
              {en ? 'Copy link' : 'Copiar link'}
            </button>
          </div>
        </section>
      ) : null}

      {intent.status === 'requires_payment' ? (
        <section className="flex flex-col gap-2.5">
          {actionError ? (
            <p role="alert" className="text-center text-[13px] text-danger">
              {actionError}
            </p>
          ) : null}
          {testnet ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => act('simulate')}
              className="btn btn-ghost btn-block"
            >
              {en ? 'Mark as paid (sandbox)' : 'Marcar como pagado (sandbox)'}
            </button>
          ) : null}
          {confirmCancel ? (
            <div className="flex gap-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => act('cancel')}
                className="btn btn-danger flex-1"
              >
                {en ? 'Cancel charge' : 'Cancelar cobro'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmCancel(false)}
                className="btn btn-ghost flex-1"
              >
                {en ? 'Keep it' : 'Mantener'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmCancel(true)}
              className="btn-text w-full text-danger"
            >
              {en ? 'Cancel this charge' : 'Cancelar este cobro'}
            </button>
          )}
        </section>
      ) : null}
    </div>
  );
}

function ApiKeys(props: Props) {
  const { settings, session, english: en } = props;
  const [revision, setRevision] = useState(0);
  const { data, error } = useFlow<{ data: { id: string; last4: string; created_at: number }[] }>(
    props,
    'api_keys',
    revision,
  );
  const [created, setCreated] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState('');
  const run = (action: () => Promise<unknown>) => {
    setBusy(true);
    setActionError('');
    action()
      .then(() => setRevision((value) => value + 1))
      .catch((failure: unknown) => setActionError(failureMessage(failure, en)))
      .finally(() => {
        setBusy(false);
        setRevoking(null);
      });
  };
  return (
    <div className="animate-fade-up">
      <p className="mb-5 text-[13px] leading-relaxed text-text-muted">
        {en
          ? 'Your server uses a key to create charges and read events. Keep it secret; anyone with it can create charges in your name.'
          : 'Tu servidor usa una clave para crear cobros y leer eventos. Guárdala en secreto: con ella se pueden crear cobros a tu nombre.'}
      </p>
      {created ? <OneTimeSecret value={created} english={en} /> : null}
      {actionError ? (
        <p role="alert" className="auth-error mb-4">
          {actionError}
        </p>
      ) : null}
      <button
        type="button"
        disabled={busy}
        className="btn btn-primary btn-block mb-6"
        onClick={() =>
          run(() =>
            flowApi<{ key: string }>(settings, session, 'api_keys', { body: {} }).then(({ key }) =>
              setCreated(key),
            ),
          )
        }
      >
        {en ? 'Create API key' : 'Crear clave API'}
      </button>
      {error ? (
        <p role="alert" className="auth-error">
          {error}
        </p>
      ) : !data ? (
        <RowSkeletonList count={2} />
      ) : data.data.length === 0 ? (
        <p className="text-center text-[14px] text-text-muted">
          {en ? 'No keys yet.' : 'Todavía no hay claves.'}
        </p>
      ) : (
        <div className="meli-paper-card divide-y divide-border">
          {data.data.map((key) => (
            <div key={key.id} className="flex items-center gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[14px]">sk_…{key.last4}</p>
                <p className="text-[12px] text-text-faint">{date(key.created_at, en)}</p>
              </div>
              {revoking === key.id ? (
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        flowApi(settings, session, `api_keys/${key.id}`, { method: 'DELETE' }),
                      )
                    }
                    className="bg-danger/10 px-2.5 py-1.5 text-[13px] font-medium text-danger"
                  >
                    {en ? 'Revoke' : 'Revocar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRevoking(null)}
                    className="bg-surface-2 px-2 py-1.5 text-[13px] text-text-muted"
                  >
                    {en ? 'Cancel' : 'Cancelar'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setRevoking(key.id)}
                  className="text-[13px] text-danger underline"
                >
                  {en ? 'Revoke' : 'Revocar'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Webhooks(props: Props) {
  const { settings, session, english: en } = props;
  const [revision, setRevision] = useState(0);
  const { data, error } = useFlow<{ data: { id: string; url: string; created_at: number }[] }>(
    props,
    'webhook_endpoints',
    revision,
  );
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState('');
  const run = (action: () => Promise<unknown>) => {
    setBusy(true);
    setActionError('');
    action()
      .then(() => setRevision((value) => value + 1))
      .catch((failure: unknown) => setActionError(failureMessage(failure, en)))
      .finally(() => {
        setBusy(false);
        setRemoving(null);
      });
  };
  return (
    <div className="animate-fade-up">
      <p className="mb-5 text-[13px] leading-relaxed text-text-muted">
        {en
          ? 'GatoPago sends every event to your URLs, signed in the '
          : 'GatoPago envía cada evento a tus URLs, firmado en el encabezado '}
        <code className="font-mono">GatoPago-Signature</code>
        {en
          ? ' header (HMAC-SHA256 with the endpoint secret). Failures are retried up to 10 times.'
          : ' (HMAC-SHA256 con el secreto del endpoint). Si falla, se reintenta hasta 10 veces.'}
      </p>
      {secret ? <OneTimeSecret value={secret} english={en} /> : null}
      <form
        className="mb-6 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          run(() =>
            flowApi<{ secret: string }>(settings, session, 'webhook_endpoints', {
              body: { url },
            }).then((endpoint) => {
              setSecret(endpoint.secret);
              setUrl('');
            }),
          );
        }}
      >
        <input
          type="url"
          required
          inputMode="url"
          placeholder="https://tu-servidor.com/webhooks/gatopago"
          aria-label={en ? 'Endpoint URL' : 'URL del endpoint'}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          className="meli-field h-12 min-w-0 flex-1 text-[14px]"
        />
        <button
          type="submit"
          disabled={busy || !url}
          className="btn btn-primary btn-sm h-12 shrink-0"
        >
          {en ? 'Add' : 'Agregar'}
        </button>
      </form>
      {actionError ? (
        <p role="alert" className="auth-error mb-4">
          {actionError}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="auth-error">
          {error}
        </p>
      ) : !data ? (
        <RowSkeletonList count={2} />
      ) : data.data.length === 0 ? (
        <p className="text-center text-[14px] text-text-muted">
          {en ? 'No endpoints yet.' : 'Todavía no hay endpoints.'}
        </p>
      ) : (
        <div className="meli-paper-card divide-y divide-border">
          {data.data.map((endpoint) => (
            <div key={endpoint.id} className="flex items-center gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-[13px]">{endpoint.url}</p>
                <p className="text-[12px] text-text-faint">{date(endpoint.created_at, en)}</p>
              </div>
              {removing === endpoint.id ? (
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        flowApi(settings, session, `webhook_endpoints/${endpoint.id}`, {
                          method: 'DELETE',
                        }),
                      )
                    }
                    className="bg-danger/10 px-2.5 py-1.5 text-[13px] font-medium text-danger"
                  >
                    {en ? 'Remove' : 'Eliminar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoving(null)}
                    className="bg-surface-2 px-2 py-1.5 text-[13px] text-text-muted"
                  >
                    {en ? 'Cancel' : 'Cancelar'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setRemoving(endpoint.id)}
                  className="text-[13px] text-danger underline"
                >
                  {en ? 'Remove' : 'Eliminar'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type Delivery = { attempts: number; delivered_at: number | null; last_status: number | null };

function deliveryLabel(deliveries: Delivery[], en: boolean): [string, string] {
  if (deliveries.length === 0) return [en ? 'No endpoints' : 'Sin endpoints', 'text-text-faint'];
  if (deliveries.every((delivery) => delivery.delivered_at))
    return [en ? 'Delivered' : 'Entregado', 'text-growth'];
  if (deliveries.some((delivery) => delivery.attempts >= 10))
    return [en ? 'Failed' : 'Falló', 'text-danger'];
  const attempts = Math.max(...deliveries.map((delivery) => delivery.attempts));
  return attempts === 0
    ? [en ? 'Sending' : 'Enviando', 'text-info']
    : [en ? `Retrying (${attempts})` : `Reintentando (${attempts})`, 'text-pending'];
}

function Events(props: Props) {
  const { settings, session, english: en } = props;
  const [revision, setRevision] = useState(0);
  const { data, error } = useFlow<{
    data: { id: string; type: string; created_at: number; data: unknown; deliveries: Delivery[] }[];
  }>(props, 'events', revision);
  const [resending, setResending] = useState<string | null>(null);
  return (
    <div className="animate-fade-up">
      <p className="mb-5 text-[13px] leading-relaxed text-text-muted">
        {en
          ? 'The latest 100 events of your account and how each delivery went.'
          : 'Los últimos 100 eventos de tu cuenta y cómo fue cada entrega.'}
      </p>
      {error ? (
        <p role="alert" className="auth-error">
          {error}
        </p>
      ) : !data ? (
        <RowSkeletonList count={6} />
      ) : data.data.length === 0 ? (
        <p className="text-center text-[14px] text-text-muted">
          {en ? 'No events yet.' : 'Todavía no hay eventos.'}
        </p>
      ) : (
        <div className="meli-paper-card divide-y divide-border">
          {data.data.map((event) => {
            const [label, tone] = deliveryLabel(event.deliveries, en);
            return (
              <details key={event.id} className="px-4 py-3">
                <summary className="flex cursor-pointer list-none items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[13px]">{event.type}</span>
                    <span className="block text-[12px] text-text-faint">
                      {date(event.created_at, en)}
                    </span>
                  </span>
                  <span className={`shrink-0 text-[12px] font-semibold ${tone}`}>{label}</span>
                </summary>
                <pre className="mt-3 max-h-64 overflow-auto border border-border bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-text-muted">
                  {JSON.stringify(event.data, null, 2)}
                </pre>
                {event.deliveries.length > 0 ? (
                  <button
                    type="button"
                    disabled={resending === event.id}
                    className="btn btn-ghost btn-sm mt-3"
                    onClick={() => {
                      setResending(event.id);
                      flowApi(settings, session, `events/${event.id}/resend`, { body: {} })
                        .then(() => setRevision((value) => value + 1))
                        .catch(() => undefined)
                        .finally(() => setResending(null));
                    }}
                  >
                    {resending === event.id
                      ? en
                        ? 'Resending…'
                        : 'Reenviando…'
                      : en
                        ? 'Resend'
                        : 'Reenviar'}
                  </button>
                ) : null}
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
