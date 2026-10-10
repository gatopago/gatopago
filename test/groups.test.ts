import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Group } from '../src/wallet/groups';

// The hook without a renderer: state and refs live in slots; its one effect is its last hook, so
// it marks the end of a render and the test runs it.
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
  useEffect: (effect: () => unknown) => {
    react.effects.push(effect);
    react.index = 0;
  },
}));
vi.mock('../src/wallet/useAction', () => ({
  useAction: () => ({
    busy: false,
    error: '',
    run: (action: () => Promise<void>) => action().then(() => true),
  }),
}));
const server = vi.hoisted(() => ({
  reads: [] as { resolve: (list: Group[]) => void; reject: (error: Error) => void }[],
  groups: [] as Group[],
}));
vi.mock('../src/wallet/groups', () => ({
  listGroups: () => new Promise((resolve, reject) => server.reads.push({ resolve, reject })),
  saveGroup: async (_settings: unknown, _session: unknown, group: Group) =>
    (server.groups = [group, ...server.groups.filter(({ name }) => name !== group.name)]),
  deleteGroup: async (_settings: unknown, _session: unknown, name: string) =>
    (server.groups = server.groups.filter((group) => group.name !== name)),
}));

import { useGroups } from '../src/consumer/useGroups';

const settings = {} as never;
const session = {} as never;
const audit: Group = { name: 'Audit group', members: [{ who: '@ana', amount: '5', share: '' }] };
/** Renders once: the hook as the screen would read it. */
const useRendered = () => useGroups(settings, session);
const runEffects = () => react.effects.splice(0).forEach((effect) => effect());
const settle = () => new Promise((done) => setTimeout(done));

beforeEach(() => {
  react.slots = [];
  react.index = 0;
  react.effects = [];
  server.reads = [];
  server.groups = [];
});

describe('My groups', () => {
  it('keeps a group just saved when an older read of the list arrives after it', async () => {
    useRendered();
    runEffects();
    await useRendered().save(audit);
    expect(useRendered().groups).toEqual([audit]);
    // The first read, asked before saving, answers the list as it was then.
    server.reads[0].resolve([]);
    await settle();
    expect(useRendered().groups).toEqual([audit]);
  });

  it('keeps a group just deleted away from an older read too', async () => {
    server.groups = [audit];
    useRendered();
    runEffects();
    await useRendered().remove('Audit group');
    server.reads[0].resolve([audit]);
    await settle();
    expect(useRendered().groups).toEqual([]);
  });

  it('tells a failed read apart from having no groups, and reads again on retry', async () => {
    useRendered();
    runEffects();
    server.reads[0].reject(new Error('UNAVAILABLE'));
    await settle();
    expect(useRendered().failed).toBe(true);
    useRendered().retry();
    expect(useRendered().failed).toBe(false);
    runEffects();
    server.reads[1].resolve([audit]);
    await settle();
    expect(useRendered().groups).toEqual([audit]);
  });
});
