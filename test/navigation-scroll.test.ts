import { describe, expect, it } from 'vitest';
import { navigationScrollState } from '../src/marketing/navigation-scroll';

describe('Landing navigation scroll direction', () => {
  it('hides when scrolling down beyond the header and reveals when scrolling up', () => {
    expect(navigationScrollState(100, 300, false)).toEqual({
      scrolled: true,
      hidden: true,
      previousY: 300,
    });
    expect(navigationScrollState(300, 250, false)).toEqual({
      scrolled: true,
      hidden: false,
      previousY: 250,
    });
  });
  it('always stays visible near the top, including overscroll', () => {
    expect(navigationScrollState(0, 60, false).hidden).toBe(false);
    expect(navigationScrollState(100, -20, false)).toEqual({
      scrolled: false,
      hidden: false,
      previousY: 0,
    });
  });
  it('ignores small jitter without losing accumulated travel', () => {
    const jitter = navigationScrollState(250, 254, false);
    expect(jitter.hidden).toBeNull();
    expect(jitter.previousY).toBe(250);
    expect(navigationScrollState(jitter.previousY, 259, false).hidden).toBe(true);
  });
  it('stays visible with an open menu or keyboard focus', () => {
    expect(navigationScrollState(150, 800, true)).toEqual({
      scrolled: true,
      hidden: false,
      previousY: 800,
    });
  });
});
