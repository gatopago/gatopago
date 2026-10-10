import { parseUnits } from 'viem';

/**
 * What an amount field keeps from what was typed or pasted: a plain decimal (`1234.56`), or `null`
 * to refuse the change and keep the previous value. Never a different number from the one meant:
 *
 * - One separator, `.` or `,`, is the decimal one (`1,25` and `1.25` are both 1.25).
 * - Both, as in `1.234,56` or `1,234.56`: the last one is decimal, the other groups thousands.
 * - The same one repeated groups thousands only in a whole amount (`1.234.567`).
 * - A sign, letters or a grouping that is not by thousands is refused. A pasted `$` or `USDC` and
 *   spaces are dropped.
 */
export function amountInput(text: string): string | null {
  const plain = text
    .replace(/^\s*(US)?\$/i, '')
    .replace(/(USDC|USD)\s*$/i, '')
    .replace(/\s/g, '');
  if (/[^0-9.,]/.test(plain)) return null;
  const separators = plain.match(/[.,]/g) ?? [];
  if (separators.length === 0) return plain;
  if (separators.length === 1) return plain.replace(',', '.');
  const decimal = separators.at(-1)!;
  const group = decimal === '.' ? ',' : '.';
  const groups = (whole: string, mark: string) =>
    new RegExp(`^\\d{1,3}(\\${mark}\\d{3})+$`).test(whole);
  if (separators.every((mark) => mark === decimal))
    return groups(plain, decimal) ? plain.split(decimal).join('') : null;
  const point = plain.lastIndexOf(decimal);
  const whole = plain.slice(0, point);
  if (whole.includes(decimal) || !groups(whole, group)) return null;
  return `${whole.split(group).join('')}.${plain.slice(point + 1)}`;
}

/** More decimals than the coin has, other than zeros: an amount it cannot move exactly. */
export const tooPrecise = (value: string, decimals: number) =>
  /[1-9]/.test((value.replace(',', '.').split('.')[1] ?? '').slice(decimals));

/**
 * An amount in the coin's units, exactly as typed: `TOO_MANY_DECIMALS` instead of the rounding
 * viem's `parseUnits` would apply (`1.9999999` USDC would become 2).
 */
export function exactUnits(value: string, decimals: number): bigint {
  if (tooPrecise(value, decimals)) throw new Error('TOO_MANY_DECIMALS');
  const [whole, fraction = ''] = value.replace(',', '.').split('.');
  return parseUnits(`${whole || '0'}.${fraction.slice(0, decimals) || '0'}`, decimals);
}
