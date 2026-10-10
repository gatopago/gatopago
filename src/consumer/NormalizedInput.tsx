'use client';

import { useState, type InputHTMLAttributes } from 'react';
import { amountInput } from '../lib/amount';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
};

/**
 * A field whose text is normalized as it is typed; `normalize` returning null refuses the text and
 * the field keeps the previous value. While a phone keyboard composes a word the field shows what
 * it typed, and the normalized text once the word ends: rewriting the field mid-word makes an
 * Android keyboard repeat letters ("ddadandani") or drop what follows ("0,5" stays "0.").
 */
function NormalizedInput({
  value,
  onChange,
  normalize,
  ...props
}: Props & { normalize: (text: string) => string | null }) {
  const [composing, setComposing] = useState<string | null>(null);
  return (
    <input
      {...props}
      type="text"
      value={composing ?? value}
      onChange={(event) => {
        const next = normalize(event.target.value);
        if (next === null) return;
        setComposing((event.nativeEvent as InputEvent).isComposing ? event.target.value : null);
        onChange(next);
      }}
      onCompositionEnd={() => setComposing(null)}
    />
  );
}

/**
 * Amount entry for every mobile keyboard: a decimal keypad that may only offer a comma. What it
 * keeps is decided by `amountInput`: a typed or pasted amount is kept as meant, or refused.
 */
export function AmountInput(props: Omit<Props, 'inputMode'>) {
  return (
    <NormalizedInput {...props} inputMode="decimal" autoComplete="off" normalize={amountInput} />
  );
}

/** A GatoPago @username: lowercase letters, numbers and underscores. */
export function UsernameInput(props: Omit<Props, 'autoCapitalize' | 'spellCheck'>) {
  return (
    <NormalizedInput
      {...props}
      autoCapitalize="none"
      spellCheck={false}
      normalize={(text) => text.replace(/[^a-z0-9_]/gi, '').toLowerCase()}
    />
  );
}
