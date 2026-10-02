'use client';

import { useId, type ReactNode } from 'react';
import { NavigationLink } from './NavigationLink';
import { localizedPath } from './routes';

export function BackHeader({ title, english, to = '/app' }: { title: string; english: boolean; to?: string }) {
  return <header className="mb-7 flex items-center gap-4"><NavigationLink href={localizedPath(to, english)} replace
    aria-label={english ? 'Back' : 'Volver'} className="meli-square-action flex h-12 w-12 shrink-0 items-center justify-center">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m12 4-8 8 8 8M4 12h17" /></svg>
  </NavigationLink><h1 className="font-display text-[28px] leading-tight">{title}</h1></header>;
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`meli-paper-card mb-6 p-5 ${className}`}>{children}</section>;
}

export function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return <div className="mb-4"><label htmlFor={id} className="mb-2 block text-[13px] text-text-muted">{label}</label>{children(id)}</div>;
}

/** Not a fake API response. An unavailable capability must not look like success. */
export function IntegrationNotice({ english: en, identityOnly = false }: { english: boolean; identityOnly?: boolean }) {
  return <div role="note" className="mb-5 border-l-4 border-warning bg-warning/10 p-4 text-[13px] leading-relaxed">
    {identityOnly
      ? en ? 'Identity is not configured in this environment. This screen does not contain account data.' : 'La identidad no está configurada en este ambiente. Esta pantalla no contiene datos de una cuenta.'
      : en ? 'This feature is not available yet.' : 'Esta función aún no está disponible.'}
  </div>;
}

export function ActionCard({ href, title, description, english }: { href: string; title: string; description: string; english: boolean }) {
  return <NavigationLink href={localizedPath(href, english)} className="meli-path-card-app interactive-surface mb-3 flex items-center gap-4 p-4">
    <span aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></span>
    <div className="min-w-0 flex-1"><h2 className="font-display text-[17px]">{title}</h2><p className="mt-1 text-[12px] leading-relaxed text-text-muted">{description}</p></div>
    <span aria-hidden="true" className="text-xl">→</span>
  </NavigationLink>;
}
