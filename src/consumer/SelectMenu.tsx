'use client';

import { useId, useRef, useState } from 'react';
import { ChevronDownIcon } from './Icons';
import { Sheet } from './Sheet';
import { NetworkIcon } from './TokenIcon';
import { moveOptionFocus } from './listbox';
import { useTranslations } from 'next-intl';

interface SelectMenuOption {
  value: string;
  label: string;
  description?: string;
  /** A network option shows its logo. */
  network?: string;
}

/** V2's selector: a trigger that opens a sheet of options (networks, assets). */
export function SelectMenu({
  label,
  value,
  options,
  onChange,
  showLabel = true,
  placeholder,
  disabled = false,
  className = '',
}: {
  label: string;
  value: string;
  options: SelectMenuOption[];
  onChange: (value: string) => void;
  showLabel?: boolean;
  /** Shown until an option is chosen. */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations('SelectMenu');
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
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
        className="select-menu-trigger interactive-surface flex h-12 w-full items-center justify-between gap-2 border border-border bg-surface px-3.5 text-left disabled:opacity-45"
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected?.network ? <NetworkIcon id={selected.network} size={22} /> : null}
          <span className={`truncate ${selected ? 'text-text' : 'text-text-faint'}`}>
            {selected?.label ?? placeholder ?? label}
          </span>
        </span>
        <ChevronDownIcon className="shrink-0 text-text-faint" />
      </button>
      {open ? (
        <Sheet titleId={titleId} onClose={() => setOpen(false)} variant="selector">
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <h2 id={titleId} className="font-display text-[20px]">
              {label}
            </h2>
            <button
              type="button"
              data-sheet-close
              aria-label={t('close')}
              className="meli-square-action h-11 w-11"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <div role="listbox" aria-labelledby={titleId} className="flex flex-col gap-1.5">
            {options.map((option, index) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  ref={(element) => {
                    optionRefs.current[index] = element;
                  }}
                  role="option"
                  aria-selected={isSelected}
                  onKeyDown={(event) => moveOptionFocus(event, index, optionRefs.current)}
                  data-sheet-close
                  onClick={() => {
                    onChange(option.value);
                  }}
                  className={`select-menu-option flex min-h-14 w-full items-center gap-3 border px-4 py-3 text-left ${isSelected ? 'border-text bg-cat-500/15 shadow-[3px_3px_0_var(--color-cat-700)]' : 'border-border bg-surface'}`}
                >
                  {option.network ? <NetworkIcon id={option.network} size={32} /> : null}
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
