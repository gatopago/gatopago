'use client';

import type { ReactNode, Ref } from 'react';
import { NavigationLink } from './NavigationLink';
import { BackIcon, ChevronIcon } from './Icons';
import { useBack } from './history';
import { useTranslations } from 'next-intl';

/**
 * A screen's top bar, fixed while it scrolls: back to where the member came from (`to`, the
 * screen's parent, when opened directly), the title, and an optional action.
 */
export function BackHeader({
  title,
  to = '/app',
  onBack,
  action,
}: {
  title: string;
  to?: string;
  /** A step inside the screen (a result, a sub-view) goes back to the screen itself. */
  onBack?: () => void;
  action?: ReactNode;
}) {
  const t = useTranslations('Primitives');
  const back = useBack(to);
  return (
    <header className="back-header">
      <button
        type="button"
        onClick={onBack ?? back}
        aria-label={t('back')}
        className="back-header__button"
      >
        <BackIcon />
      </button>
      <h1 className="back-header__title">{title}</h1>
      {action}
    </header>
  );
}

/** The title of a main tab (Move, Grow, Activity), under the account's header. */
export function TabHeader({
  title,
  description,
  art,
}: {
  title: string;
  description?: ReactNode;
  art?: ReactNode;
}) {
  return (
    <header className="tab-header">
      <div className="min-w-0 flex-1">
        <h1 className="tab-header__title">{title}</h1>
        {description ? <p className="tab-header__description">{description}</p> : null}
      </div>
      {art}
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
  icon,
  tone = 'brand',
  badge,
}: {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
  tone?: keyof typeof tones;
  badge?: string;
}) {
  return (
    <NavigationLink
      href={href}
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
