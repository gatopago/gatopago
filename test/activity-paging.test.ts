import { describe, expect, it, vi } from 'vitest';

// The hook without a renderer: state and refs live in slots, effects are run by the test. Its
// second effect is its last hook, so it marks the end of a render.
const react = vi.hoisted(() => ({
  slots: [] as unknown[],
  index: 0,
  effects: [] as (() => unknown)[],
}));
vi.mock('react', () => ({
  useState: <T>(initial: T) => {
    const slot = react.index++;
    if (!(slot in react.slots)) react.slots[slot] = initial;
    return [
      react.slots[slot],
      (next: T | ((current: T) => T)) => {
        react.slots[slot] =
          typeof next === 'function' ? (next as (current: T) => T)(react.slots[slot] as T) : next;
      },
    ];
  },
  useRef: <T>(current: T) => {
    const slot = react.index++;
    if (!(slot in react.slots)) react.slots[slot] = { current };
    return react.slots[slot];
  },
  useCallback: <T>(callback: T) => callback,
  useEffect: (effect: () => unknown) => {
    react.effects.push(effect);
    if (react.effects.length === 2) react.index = 0;
  },
}));
const api = vi.hoisted(() => ({ answers: new Map<string, (value: unknown) => void>() }));
vi.mock('../src/wallet/api', () => ({
  api: (_origin: string, path: string) => new Promise((resolve) => api.answers.set(path, resolve)),
}));
const push = vi.hoisted(() => ({ listener: () => {} }));
vi.mock('../src/wallet/push', () => ({
  onMovement: (listener: () => void) => {
    push.listener = listener;
    return () => {};
  },
}));
vi.mock('../src/wallet/messages', () => ({ failureMessage: () => 'failed' }));

import { useActivity } from '../src/wallet/activity';

const settings = { apiOrigin: 'https://api.test' } as never;
const session = { token: 'token' } as never;
const movement = (id: number) => ({ id: String(id) });
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => movement(from + i));
const settle = () => new Promise((done) => setTimeout(done));

/** Renders once; `runEffects` then runs that render's effects (subscription, first page). */
function useRendered() {
  return useActivity(settings, session, false);
}
const runEffects = () => react.effects.splice(0).forEach((effect) => effect());

describe('activity paging', () => {
  it('drops a page of the old list that arrives after a fresh first page', async () => {
    useRendered();
    runEffects();
    api.answers.get('activity')!({ activity: range(1, 50), next_cursor: 'c1' });
    await settle();
    const loaded = useRendered();
    runEffects();
    loaded.loadMore();
    // A movement arrives while the second page is still on its way.
    push.listener();
    useRendered();
    runEffects();
    api.answers.get('activity')!({
      activity: [...range(101, 105), ...range(1, 45)],
      next_cursor: 'c2',
    });
    await settle();
    api.answers.get('activity?before=c1')!({ activity: range(51, 100), next_cursor: null });
    await settle();
    const { movements, hasMore, loadingMore } = useRendered();
    expect(movements!.map(({ id }) => id)).toEqual(
      [...range(101, 105), ...range(1, 45)].map(({ id }) => id),
    );
    // The fresh list can still be continued from its own cursor.
    expect(hasMore).toBe(true);
    expect(loadingMore).toBe(false);
  });
});
