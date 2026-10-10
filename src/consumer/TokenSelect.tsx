'use client';

import { useId, useRef, useState } from 'react';
import { ChevronDownIcon } from './Icons';
import { Sheet } from './Sheet';
import { TokenIcon } from './TokenIcon';

interface TokenOption {
  value: string;
  symbol: string;
  label: string;
  balance?: string;
  /** Listed but empty: shown quieter, below the coins the account holds. */
  muted?: boolean;
}

export function TokenSelect({
  value,
  options,
  onChange,
  english: en,
  label,
  disabled = false,
}: {
  value: string;
  options: TokenOption[];
  onChange: (value: string) => void;
  english: boolean;
  label?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = options.find((item) => item.value === value) ?? options[0];
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="select-menu-trigger interactive-surface inline-flex h-10 min-w-[104px] max-w-full items-center justify-between gap-3 border border-border bg-surface px-2.5 text-left text-[13px]"
        aria-label={label ?? (en ? 'Choose currency' : 'Elegir moneda')}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <TokenIcon symbol={selected.symbol} />
        <span className="min-w-0 truncate">{selected.symbol}</span>
        <ChevronDownIcon size={14} />
      </button>
      {open ? (
        <Sheet titleId={titleId} onClose={() => setOpen(false)} variant="selector">
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <h2 id={titleId} className="font-display text-[20px]">
              {en ? 'Choose currency' : 'Elige una moneda'}
            </h2>
            <button
              type="button"
              className="meli-square-action h-11 w-11"
              aria-label={en ? 'Close' : 'Cerrar'}
              data-sheet-close
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <div role="listbox" aria-labelledby={titleId} className="flex flex-col gap-1.5">
            {options.map((item, index) => (
              <button
                key={item.value}
                type="button"
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                role="option"
                aria-selected={item.value === value}
                className={`select-menu-option flex min-h-14 w-full items-center gap-3 border px-4 py-3 text-left ${item.value === value ? 'border-text bg-cat-500/15 shadow-[3px_3px_0_var(--color-cat-700)]' : 'border-border bg-surface'}`}
                onKeyDown={(event) => {
                  const next =
                    event.key === 'ArrowDown'
                      ? (index + 1) % options.length
                      : event.key === 'ArrowUp'
                        ? (index - 1 + options.length) % options.length
                        : event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? options.length - 1
                            : null;
                  if (next !== null) {
                    event.preventDefault();
                    optionRefs.current[next]?.focus();
                  }
                }}
                data-sheet-close
                onClick={() => {
                  onChange(item.value);
                }}
              >
                <TokenIcon symbol={item.symbol} size={28} />
                <span className={`min-w-0 flex-1 text-left ${item.muted ? 'opacity-55' : ''}`}>
                  <span className="block truncate text-[14px]">{item.symbol}</span>
                  <span className="select-menu-option__detail mt-0.5 block text-[12px] leading-relaxed">
                    {item.label}
                    {item.balance !== undefined ? ` · ${item.balance} ${item.symbol}` : ''}
                  </span>
                </span>
                {item.value === value ? (
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
                ) : null}
              </button>
            ))}
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
