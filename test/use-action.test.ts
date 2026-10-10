import { describe, expect, it, vi } from 'vitest';

// The hook's logic without a renderer: state setters do nothing, refs are plain objects.
vi.mock('react', () => ({
  useRef: <T>(current: T) => ({ current }),
  useState: <T>(value: T) => [value, () => {}],
}));
vi.mock('../src/wallet/messages', () => ({ useFailureMessage: () => () => 'failed' }));

describe('useAction', () => {
  it('runs one action at a time, even when tapped twice before a render', async () => {
    const { useAction } = await import('../src/wallet/useAction');
    const { run } = useAction();
    let release = () => {};
    const action = vi.fn(() => new Promise<void>((done) => (release = done)));
    const first = run(action);
    expect(await run(action)).toBe(false);
    release();
    expect(await first).toBe(true);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('is free again after an action that throws before returning a promise', async () => {
    const { useAction } = await import('../src/wallet/useAction');
    const { run } = useAction();
    expect(
      await run(() => {
        throw new Error('INVALID_AMOUNT');
      }),
    ).toBe(false);
    expect(await run(async () => {})).toBe(true);
  });
});
