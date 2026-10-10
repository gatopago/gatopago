import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const account = '0x2222222222222222222222222222222222222222';
const storage = new Map<string, string>();
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['Date'] });
  storage.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('a crossing between networks', () => {
  it('is followed again after a reload, until its USDC arrives', async () => {
    const crossing = { from: 'eip155:43113', to: 'eip155:421614', amount: '5000000', hash: '0xb' };
    (await import('../src/wallet/crossings')).rememberCrossing(account, crossing);
    vi.resetModules();
    const later = await import('../src/wallet/crossings');
    expect(later.crossingsOf(account)).toEqual([expect.objectContaining(crossing)]);
    // Another account on this device does not see it.
    expect(later.crossingsOf('0x3333333333333333333333333333333333333333')).toEqual([]);
    later.forgetCrossing(account, '0xb');
    expect(later.crossingsOf(account)).toEqual([]);
  });

  it('is let go after a week', async () => {
    const { crossingsOf, rememberCrossing } = await import('../src/wallet/crossings');
    rememberCrossing(account, { from: 'a', to: 'b', amount: '1', hash: '0xc' });
    vi.setSystemTime(Date.now() + 8 * 86_400_000);
    expect(crossingsOf(account)).toEqual([]);
  });
});
