import type { ReactNode } from 'react';

export function SettingsSection({
  title,
  icon,
  tone = 'brand',
  id,
  children,
}: {
  title?: string;
  icon?: ReactNode;
  tone?: 'brand' | 'growth' | 'info' | 'pending' | 'danger' | 'neutral';
  id?: string;
  children: ReactNode;
}) {
  const tones = {
    brand: 'bg-cat-500/12 text-cat-300',
    growth: 'bg-growth/12 text-growth',
    info: 'bg-info/12 text-info',
    pending: 'bg-pending/12 text-pending',
    danger: 'bg-danger/12 text-danger',
    neutral: 'bg-surface-3 text-text-muted',
  } as const;
  return (
    <section id={id} className="mb-6 scroll-mt-4">
      {title ? (
        <div className="flex items-center gap-2.5 px-1 mb-2.5">
          {icon ? (
            <span
              aria-hidden="true"
              className={`flex h-7 w-7 shrink-0 items-center justify-center ${tones[tone]}`}
            >
              {icon}
            </span>
          ) : null}
          <h2 className="text-text-faint text-[12px] font-semibold uppercase tracking-[0.08em]">
            {title}
          </h2>
        </div>
      ) : null}
      <div className="meli-paper-card meli-paper-card--strong overflow-hidden">{children}</div>
    </section>
  );
}
