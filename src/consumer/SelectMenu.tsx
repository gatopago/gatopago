'use client';

import { useId, useState, type InputHTMLAttributes } from 'react';
import { Sheet } from './Sheet';

const tones = {
  brand: 'bg-cat-500/14 text-cat-300',
  growth: 'bg-growth/14 text-growth',
  info: 'bg-info/14 text-info',
  pending: 'bg-pending/14 text-pending',
} as const;

export interface SelectMenuOption {
  value: string;
  label: string;
  description?: string;
  tone?: keyof typeof tones;
}

/** V2's selector: a trigger that opens a sheet of options (networks, assets). */
export function SelectMenu({
  label,
  value,
  options,
  onChange,
  english: en,
  showLabel = true,
  placeholder,
  disabled = false,
  className = '',
}: {
  label: string;
  value: string;
  options: SelectMenuOption[];
  onChange: (value: string) => void;
  english: boolean;
  showLabel?: boolean;
  /** Shown until an option is chosen. */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const selected = options.find((option) => option.value === value);
  return (
    <div className={className}>
      <span className={showLabel ? 'mb-2 block text-[13px] text-text-muted' : 'sr-only'}>
        {label}
      </span>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${selected?.label ?? ''}`}
        onClick={() => setOpen(true)}
        className="select-menu-trigger interactive-surface flex h-12 w-full items-center justify-between gap-3 border border-border bg-surface px-4 text-left disabled:opacity-45"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {selected?.tone ? (
            <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 ${tones[selected.tone]}`} />
          ) : null}
          <span className={`truncate ${selected ? 'text-text' : 'text-text-faint'}`}>
            {selected?.label ?? placeholder ?? label}
          </span>
        </span>
        <Chevron />
      </button>
      {open ? (
        <Sheet titleId={titleId} onClose={() => setOpen(false)} variant="selector">
          <div className="sheet-handle mb-3" aria-hidden="true" />
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <h2 id={titleId} className="font-display text-[20px]">
              {label}
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={en ? 'Close' : 'Cerrar'}
              className="meli-square-action h-11 w-11"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <div role="listbox" aria-labelledby={titleId} className="flex flex-col gap-1.5">
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`select-menu-option flex min-h-14 w-full items-center gap-3 border px-4 py-3 text-left ${isSelected ? 'border-text bg-cat-500/15 shadow-[3px_3px_0_var(--color-cat-700)]' : 'border-border bg-surface'}`}
                >
                  {option.tone ? (
                    <span aria-hidden="true" className={`h-9 w-9 shrink-0 ${tones[option.tone]}`} />
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] text-text">{option.label}</span>
                    {option.description ? (
                      <span className="mt-0.5 block text-[12px] leading-relaxed text-text-muted">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                  {isSelected ? <Check /> : null}
                </button>
              );
            })}
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}

/**
 * Amount entry for every mobile keyboard: a decimal keypad that may only offer a comma, so commas
 * become dots and only digits and one separator remain.
 */
export function AmountInput({
  value,
  onChange,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'inputMode' | 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={value}
      onChange={(event) => {
        const normalized = event.target.value.replace(/,/g, '.').replace(/[^0-9.]/g, '');
        const dot = normalized.indexOf('.');
        onChange(
          dot === -1
            ? normalized
            : normalized.slice(0, dot + 1) + normalized.slice(dot + 1).replace(/\./g, ''),
        );
      }}
    />
  );
}

const Chevron = () => (
  <svg
    aria-hidden="true"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    className="shrink-0 text-text-faint"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const Check = () => (
  <svg
    aria-hidden="true"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    className="shrink-0 text-cat-300"
  >
    <path d="m5 12 4 4L19 6" />
  </svg>
);
