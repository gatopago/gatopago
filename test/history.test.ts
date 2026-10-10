import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => vi.resetModules());

describe('the record of visited screens', () => {
  it('goes back several screens at once with the browser, and forward again from there', async () => {
    const { record } = await import('../src/consumer/history');
    expect(record('/app')).toBe('none');
    expect(record('/move')).toBe('tab');
    expect(record('/send')).toBe('forward');
    // The browser goes back two entries at once (a long press on back, or two swipes).
    expect(record('/app', true)).toBe('back');
    // From there the record starts over: Move is a new screen, and Home is back again.
    expect(record('/move')).toBe('tab');
    expect(record('/app')).toBe('back');
  });

  it('treats a link to an earlier screen as going there, not back through the history', async () => {
    const { record } = await import('../src/consumer/history');
    record('/app');
    record('/move');
    record('/send');
    expect(record('/app')).toBe('tab');
    // The screen just before is still back, as a link to the parent.
    expect(record('/move')).toBe('tab');
    expect(record('/app')).toBe('back');
  });

  it('goes forward with the browser to a screen no longer in the record', async () => {
    const { record } = await import('../src/consumer/history');
    record('/app');
    record('/move');
    record('/send');
    record('/move', true);
    expect(record('/send', true)).toBe('forward');
  });
});
