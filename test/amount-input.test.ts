import { describe, expect, it } from 'vitest';
import { amountInput } from '../src/lib/amount';

describe('amount field', () => {
  it('keeps what was meant, in either decimal convention', () => {
    expect(amountInput('1,25')).toBe('1.25');
    expect(amountInput('1.25')).toBe('1.25');
    expect(amountInput('1.234,56')).toBe('1234.56');
    expect(amountInput('1,234.56')).toBe('1234.56');
    expect(amountInput('1.234.567')).toBe('1234567');
    expect(amountInput('$1,234.56')).toBe('1234.56');
    expect(amountInput('12.50 USDC')).toBe('12.50');
    expect(amountInput('1 234,5')).toBe('1234.5');
  });

  it('lets an amount be typed one key at a time', () => {
    for (const step of ['', '1', '1,', '1.', '12.5', '.5', '0'])
      expect(amountInput(step)).not.toBeNull();
  });

  it('refuses what would become another number', () => {
    expect(amountInput('-10')).toBeNull();
    expect(amountInput('1.5.')).toBeNull();
    expect(amountInput('1.5,2')).toBeNull();
    expect(amountInput('1,5.2')).toBeNull();
    expect(amountInput('1.23.4')).toBeNull();
    expect(amountInput('10e3')).toBeNull();
    expect(amountInput('abc')).toBeNull();
  });
});

describe('amount to move', () => {
  it('is exact in the coin units, never rounded as parseUnits would', async () => {
    const { exactUnits, tooPrecise } = await import('../src/lib/amount');
    expect(exactUnits('1.123456', 6)).toBe(1_123_456n);
    expect(exactUnits('1,5', 6)).toBe(1_500_000n);
    expect(exactUnits('18', 6)).toBe(18_000_000n);
    // Zeros past the coin's decimals do not change the amount.
    expect(exactUnits('1.1234560000', 6)).toBe(1_123_456n);
    for (const value of ['1.1234567', '0.0000009', '1.9999999']) {
      expect(tooPrecise(value, 6)).toBe(true);
      expect(() => exactUnits(value, 6)).toThrow('TOO_MANY_DECIMALS');
    }
    // A coin with more decimals takes them.
    expect(exactUnits('0.0000009', 18)).toBe(900_000_000_000n);
  });
});
