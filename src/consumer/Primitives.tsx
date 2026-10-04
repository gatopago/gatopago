'use client';

import { useId, type ReactNode } from 'react';
import { NavigationLink } from './NavigationLink';
import { localizedPath } from './routes';
import { BackIcon, ChevronIcon, MoveIcon } from './Icons';

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
  return <section className={`meli-paper-card mb-6 p-5 ${className}`}>{children}</section>;
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

export function ActionCard({
  href,
  title,
  description,
  english,
  icon = <MoveIcon />,
}: {
  href: string;
  title: string;
  description: string;
  english: boolean;
  icon?: ReactNode;
}) {
  return (
    <NavigationLink
      href={localizedPath(href, english)}
      className="meli-path-card-app interactive-surface mb-3 p-4"
    >
      <span aria-hidden="true">{icon}</span>
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-[17px]">{title}</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-text-muted">{description}</p>
      </div>
      <ChevronIcon />
    </NavigationLink>
  );
}
