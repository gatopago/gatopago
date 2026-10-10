import { describe, expect, it } from 'vitest';
import { formatAmount, formatHolding } from '../src/wallet/balances';

describe('amounts shown', () => {
  it('shows what is signed exactly: no positive amount becomes zero', () => {
    expect(formatAmount(1n, 7, false)).toBe('0,0000001');
    expect(formatAmount(100_000_000_000n, 18, true)).toBe('0.0000001');
    expect(formatAmount(1_234_567n, 6, false)).toBe('1,234567');
    expect(formatAmount(14_360_030_000n, 6, false, 2)).toBe('14.360,03');
    expect(formatAmount(18_000_000n, 6, true, 2)).toBe('18.00');
    expect(formatAmount(1_000_000_000_000_000_000n, 18, true)).toBe('1');
  });

  it('cuts a balance to six decimals, never rounding it up', () => {
    expect(formatHolding(999_999_999_999_999_999n, 18, true)).toBe('0.999999');
    expect(formatHolding(12_345_678n, 7, false)).toBe('1,234567');
    expect(formatHolding(1_234_567n, 6, true)).toBe('1.234567');
  });
});
