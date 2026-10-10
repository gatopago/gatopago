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
