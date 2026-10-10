import type { KeyboardEvent } from 'react';

/** Arrow keys, Home and End move the focus between a listbox's options, as a native select does. */
export function moveOptionFocus(
  event: KeyboardEvent<HTMLElement>,
  index: number,
  options: readonly (HTMLElement | null)[],
) {
  const count = options.length;
  const next =
    event.key === 'ArrowDown'
      ? (index + 1) % count
      : event.key === 'ArrowUp'
        ? (index - 1 + count) % count
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? count - 1
            : null;
  if (next === null) return;
  event.preventDefault();
  options[next]?.focus();
}
