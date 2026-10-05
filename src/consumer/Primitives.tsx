'use client';

import { useId, type ReactNode, type Ref } from 'react';
import { NavigationLink } from './NavigationLink';
import { localizedPath } from './routes';
import { BackIcon, ChevronIcon } from './Icons';

export function BackHeader({
  title,
  english,
  to = '/app',
}: {
  title: string;
  english: boolean;
  to?: string;
}) {
  return (
    <header className="mb-7 flex items-center gap-4">
      <NavigationLink
        href={localizedPath(to, english)}
        replace
        aria-label={english ? 'Back' : 'Volver'}
        className="meli-square-action flex h-12 w-12 shrink-0 items-center justify-center"
      >
        <BackIcon />
      </NavigationLink>
      <h1 className="font-display text-[28px] leading-tight">{title}</h1>
    </header>
  );
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`finance-panel mb-6 ${className}`}>{children}</section>;
}

/** Original V2 financial surface, including its pixel corner and red offset. */
export function MoneyPanel({
  children,
  className = '',
  ref,
}: {
  children: ReactNode;
  className?: string;
  /** The panel exported as an image (a charge's QR card). */
  ref?: Ref<HTMLElement>;
}) {
  return (
    <section ref={ref} className={`finance-panel ${className}`}>
      {children}
    </section>
  );
}

export function SectionLabel({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <h2 className={`finance-section-label ${className}`}>{children}</h2>;
}

export function TransactionActions({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <footer className="mt-auto pt-5">
      {children}
      {hint ? (
        <p className="mt-3 text-center text-[12px] leading-relaxed text-text-faint">{hint}</p>
      ) : null}
    </footer>
  );
}

export function NoticeCard({
  title,
  children,
  tone = 'info',
  className = '',
}: {
  title: string;
  children?: ReactNode;
  tone?: 'info' | 'warning' | 'danger' | 'success';
  className?: string;
}) {
  const tones = {
    info: 'border-info bg-info/8 text-info',
    warning: 'border-pending bg-pending/8 text-pending',
    danger: 'border-danger bg-danger/8 text-danger',
    success: 'border-growth bg-growth/8 text-growth',
  };
  return (
    <div
      className={`flex items-start gap-3 border-y border-r border-l-4 px-4 py-3.5 ${tones[tone]} ${className}`}
    >
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center border border-current text-[13px] font-semibold"
        aria-hidden="true"
      >
        {tone === 'success' ? '✓' : tone === 'info' ? 'i' : '!'}
      </span>
      <div className="min-w-0">
        <p className="text-[12px] font-semibold">{title}</p>
        {children ? (
          <div className="mt-0.5 text-[12px] leading-relaxed text-text-muted">{children}</div>
        ) : null}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-2 block text-[13px] text-text-muted">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

const tones = {
  brand: 'bg-cat-500/12 text-cat-300',
  growth: 'bg-growth/12 text-growth',
  info: 'bg-info/12 text-info',
  pending: 'bg-pending/12 text-pending',
  danger: 'bg-danger/12 text-danger',
  neutral: 'bg-surface-3 text-text-muted',
} as const;

/** V2's tappable option row (Move, Send's "other options", Security). */
export function OptionCard({
  href,
  title,
  description,
  english,
  icon,
  tone = 'brand',
  badge,
}: {
  href: string;
  title: string;
  description: string;
  english: boolean;
  icon: ReactNode;
  tone?: keyof typeof tones;
  badge?: string;
}) {
  return (
    <NavigationLink
      href={localizedPath(href, english)}
      className="meli-path-card-app interactive-surface w-full p-4 text-left"
    >
      <span
        aria-hidden="true"
        className={`flex h-11 w-11 shrink-0 items-center justify-center ${tones[tone]}`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-[14px] text-text">{title}</span>
          {badge ? (
            <span className="meli-chip border-border bg-surface-2 text-text-faint">{badge}</span>
          ) : null}
        </span>
        <span className="line-clamp-2 block text-[12px] leading-relaxed text-text-muted">
          {description}
        </span>
      </span>
      <ChevronIcon />
    </NavigationLink>
  );
}
