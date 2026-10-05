'use client';

import { useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { formatUnits } from 'viem';
import type { ClientSettings } from '../lib/settings';
import { CatGlyph } from '../marketing/CatGlyph';
import { MeliSprite } from '../marketing/MeliSprite';
import { networkName } from '../wallet/account';
import { movementReceipt, presentMovement, useActivity, type Movement } from '../wallet/activity';
import type { Session } from '../wallet/session';
import { balanceHidden, Receipt } from './PaymentSheets';
import { SelectMenu } from './SelectMenu';
import { RowSkeletonList } from './Skeleton';

const RECENT_COUNT = 4;

const icons = {
  received: <path d="M12 5v14m7-7-7 7-7-7" />,
  sent: <path d="M12 19V5m-7 7 7-7 7 7" />,
  crosschain: <path d="M7 7h11l-3-3m3 3-3 3M17 17H6l3 3m-3-3 3-3" />,
  earn: <path d="M4 18 10 12l4 4 6-8M16 8h4v4" />,
  swap: <path d="M7 4v16m-4-4 4 4 4-4M17 20V4m-4 4 4-4 4 4" />,
};

/** V2's movement row: who, what, when, and the amount. */
function ActivityRow({
  movement,
  hidden,
  english: en,
  onOpen,
}: {
  movement: Movement;
  hidden: boolean;
  english: boolean;
  onOpen: () => void;
}) {
  const received = movement.direction === 'received';
  const crossing = movement.kind === 'crosschain';
  const earn = movement.kind === 'earn';
  const swap = movement.kind === 'swap';
  const { title, detail, status } = presentMovement(movement, en);
  const amount = Number(formatUnits(BigInt(movement.amount), 6)).toLocaleString(en ? 'en' : 'es', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
  const date = new Date(movement.timestamp * 1000).toLocaleDateString(en ? 'en' : 'es', {
    day: 'numeric',
    month: 'short',
  });
  return (
    <button
      type="button"
      onClick={onOpen}
      className="interactive-surface flex w-full items-center gap-3.5 border-b border-border bg-surface px-3 py-3 text-left last:border-b-0 hover:bg-cat-50"
      aria-label={`${title}, ${detail}, ${hidden ? '' : amount} ${movement.currency}`}
    >
      <span
        aria-hidden="true"
        className={`flex h-10 w-10 shrink-0 items-center justify-center border border-current ${swap || crossing ? 'bg-info/12 text-info' : earn || received ? 'bg-growth/12 text-growth' : 'bg-cat-500/12 text-cat-300'}`}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {swap
            ? icons.swap
            : earn
              ? icons.earn
              : crossing
                ? icons.crosschain
                : received
                  ? icons.received
                  : icons.sent}
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px]">{title}</span>
        <span className="block truncate text-[12px] text-text-muted">{detail}</span>
        <span className="block text-[11px] text-text-faint">
          {status} · {date}
        </span>
      </span>
      <span
        className={`type-mono shrink-0 text-right text-[14px] font-semibold ${hidden ? 'text-text-faint' : received ? 'text-growth' : 'text-text'}`}
      >
        {hidden ? '••••' : `${received ? '+' : '−'}${amount}`}
        <span className="block text-[10px] font-normal text-text-faint">{movement.currency}</span>
      </span>
    </button>
  );
}

/** Home's "Recent activity": the last movements, each opening its receipt. */
export function RecentActivity({
  settings,
  session,
  hidden,
  english: en,
}: {
  settings: ClientSettings;
  session: Session;
  hidden: boolean;
  english: boolean;
}) {
  const { movements, error } = useActivity(settings, session, en);
  const [open, setOpen] = useState<Movement | null>(null);
  if (!movements && !error)
    return (
      <div className="p-3">
        <RowSkeletonList count={RECENT_COUNT} />
      </div>
    );
  if (!movements?.length)
    return (
      <div className="px-6 py-7 text-center">
        <MeliSprite variant="head-curious" className="mx-auto mb-3 w-16" />
        <p className="text-[14px] font-semibold">
          {error || (en ? 'No activity yet' : 'Aún no hay movimientos')}
        </p>
        {!error ? (
          <p className="mt-1 text-[12px] leading-relaxed text-text-muted">
            {en
              ? 'Your payments, requests, swaps, and Grow movements will appear here.'
              : 'Tus pagos, cobros, cambios y movimientos en Crecer aparecerán aquí.'}
          </p>
        ) : null}
      </div>
    );
  return (
    <div className="flex flex-col">
      {movements.slice(0, RECENT_COUNT).map((movement) => (
        <ActivityRow
          key={movement.id}
          movement={movement}
          hidden={hidden}
          english={en}
          onOpen={() => setOpen(movement)}
        />
      ))}
      {open ? (
        <Receipt receipt={movementReceipt(open, en)} english={en} onClose={() => setOpen(null)} />
      ) : null}
    </div>
  );
}

type Period = 'all' | 'today' | 'week' | 'month' | 'prev-month' | 'custom';
type TypeFilter = 'all' | 'sent' | 'received' | 'swap';

const PERIODS: [Period, string, string][] = [
  ['all', 'Todas las fechas', 'All dates'],
  ['today', 'Hoy', 'Today'],
  ['week', 'Última semana', 'Last week'],
  ['month', 'Este mes', 'This month'],
  ['prev-month', 'Mes anterior', 'Previous month'],
  ['custom', 'Rango personalizado', 'Custom range'],
];

const TYPES: [TypeFilter, string, string][] = [
  ['all', 'Todos', 'All'],
  ['received', 'Recibidos', 'Received'],
  ['sent', 'Enviados', 'Sent'],
  ['swap', 'Cambios (SWAP)', 'Swaps'],
];

function periodBounds(period: Period, from: string, to: string) {
  const now = new Date();
  switch (period) {
    case 'today':
      return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate()), end: null };
    case 'week':
      return { start: new Date(now.getTime() - 7 * 86_400_000), end: null };
    case 'month':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: null };
    case 'prev-month':
      return {
        start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        // Day 0 of this month is the last day of the previous one.
        end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
      };
    case 'custom':
      return {
        start: from ? new Date(`${from}T00:00:00`) : null,
        end: to ? new Date(`${to}T23:59:59`) : null,
      };
    default:
      return { start: null, end: null };
  }
}

/**
 * `/statement`, V2's full activity: quick periods, a custom range, and currency, network and type
 * filters. Filters live in the URL, so a filtered view can be shared and back/forward walk them.
 */
export function ActivityScreen({
  settings,
  session,
  english: en,
}: {
  settings: ClientSettings;
  session: Session;
  english: boolean;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { movements, hasMore, loadingMore, loadMore, error } = useActivity(settings, session, en);
  const [open, setOpen] = useState<Movement | null>(null);
  const [hidden] = useState(balanceHidden);

  const pick = <T extends string>(name: string, values: readonly T[]): T | 'all' => {
    const value = params.get(name) as T | null;
    return value && values.includes(value) ? value : 'all';
  };
  const period = pick<Period>(
    'period',
    PERIODS.map(([value]) => value),
  );
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const currency = pick('asset', ['USDC']);
  const network = pick('network', settings.networks);
  const type = pick<TypeFilter>(
    'type',
    TYPES.map(([value]) => value),
  );

  /** Defaults ("all", empty) leave the URL, so the plain view stays `/statement`. */
  function setFilter(patch: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (!value || value === 'all') next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const filtered = useMemo(() => {
    const { start, end } = periodBounds(period, from, to);
    return (movements ?? []).filter((movement) => {
      const when = movement.timestamp * 1000;
      if (start && when < start.getTime()) return false;
      if (end && when > end.getTime()) return false;
      if (currency !== 'all' && movement.currency !== currency) return false;
      if (network !== 'all' && movement.network !== network) return false;
      if (type === 'swap') return movement.kind === 'swap';
      if (type !== 'all' && movement.direction !== type) return false;
      return true;
    });
  }, [movements, period, from, to, currency, network, type]);

  return (
    <>
      <header className="mb-6">
        <p className="meli-kicker mb-3">{en ? "Your money's history" : 'Historia de tu dinero'}</p>
        <h1 className="font-display text-[36px] leading-[.94]">{en ? 'Activity' : 'Actividad'}</h1>
        <p className="mt-3 text-[13px] leading-relaxed text-text-muted">
          {en
            ? 'Payments, requests, swaps, and positions in one timeline.'
            : 'Pagos, cobros, cambios y posiciones en una sola línea de tiempo.'}
        </p>
      </header>

      <SelectMenu
        label={en ? 'Period' : 'Período'}
        showLabel={false}
        value={period}
        options={PERIODS.map(([value, es, english]) => ({ value, label: en ? english : es }))}
        onChange={(value) =>
          setFilter({ period: value, ...(value !== 'custom' ? { from: '', to: '' } : {}) })
        }
        english={en}
        className="mb-3"
      />
      {period === 'custom' ? (
        <div className="mb-3 flex gap-2.5">
          {(
            [
              ['from', en ? 'From' : 'Desde', from],
              ['to', en ? 'To' : 'Hasta', to],
            ] as const
          ).map(([name, label, value]) => (
            <label key={name} className="flex-1 border border-border bg-surface px-3.5 py-2.5">
              <span className="mb-0.5 block text-[11px] text-text-faint">{label}</span>
              <input
                type="date"
                name={name}
                value={value}
                onChange={(event) => setFilter({ [name]: event.target.value })}
                className="w-full bg-transparent text-[13px] text-text scheme-light"
              />
            </label>
          ))}
        </div>
      ) : null}
      <SelectMenu
        label={en ? 'Filter by currency' : 'Filtrar por moneda'}
        showLabel={false}
        value={currency}
        options={[
          { value: 'all', label: en ? 'All currencies' : 'Todas las monedas' },
          { value: 'USDC', label: 'USDC' },
        ]}
        onChange={(value) => setFilter({ asset: value })}
        english={en}
        className="mb-2"
      />
      <SelectMenu
        label={en ? 'Filter by network' : 'Filtrar por red'}
        showLabel={false}
        value={network}
        options={[
          { value: 'all', label: en ? 'All networks' : 'Todas las redes' },
          ...settings.networks.map((id) => ({ value: id, label: networkName(id) })),
        ]}
        onChange={(value) => setFilter({ network: value })}
        english={en}
        className="mb-2"
      />
      <SelectMenu
        label={en ? 'Movement type' : 'Tipo de movimiento'}
        showLabel={false}
        value={type}
        options={TYPES.map(([value, es, english]) => ({ value, label: en ? english : es }))}
        onChange={(value) => setFilter({ type: value })}
        english={en}
        className="mb-5"
      />

      {error ? (
        <p className="auth-error mb-4" role="alert">
          {error}
        </p>
      ) : null}
      {!movements && !error ? (
        <RowSkeletonList count={8} />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-14 text-center">
          <CatGlyph className="mb-4 w-10 opacity-40" decorative />
          <p className="text-[14px] text-text-muted">
            {en ? 'No movements match these filters.' : 'No hay movimientos con estos filtros.'}
          </p>
        </div>
      ) : (
        <>
          <p className="mb-2 px-1 text-[12px] text-text-faint">
            {filtered.length}{' '}
            {filtered.length === 1
              ? en
                ? 'movement'
                : 'movimiento'
              : en
                ? 'movements'
                : 'movimientos'}
          </p>
          <div className="meli-paper-card flex flex-col">
            {filtered.map((movement) => (
              <ActivityRow
                key={movement.id}
                movement={movement}
                hidden={hidden}
                english={en}
                onOpen={() => setOpen(movement)}
              />
            ))}
          </div>
        </>
      )}
      {hasMore ? (
        <button
          type="button"
          disabled={loadingMore}
          onClick={loadMore}
          className="btn btn-ghost btn-block mt-5 disabled:opacity-50"
        >
          {loadingMore
            ? en
              ? 'Loading…'
              : 'Cargando…'
            : en
              ? 'Load older movements'
              : 'Cargar movimientos anteriores'}
        </button>
      ) : null}
      {open ? (
        <Receipt receipt={movementReceipt(open, en)} english={en} onClose={() => setOpen(null)} />
      ) : null}
    </>
  );
}
