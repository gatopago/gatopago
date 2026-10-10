import { describe, expect, it } from 'vitest';
import { members } from '../src/consumer/TeamScreen';

describe('a group payment read back', () => {
  it('keeps a team saved by this or another version of the app', () => {
    expect(
      members([
        { who: '@ana', amount: '5' },
        { who: '@luis', share: '50' },
      ]),
    ).toEqual([
      { id: 0, who: '@ana', amount: '5', share: '' },
      { id: 1, who: '@luis', amount: '', share: '50' },
    ]);
  });

  it('refuses one that is not a team, so the form starts empty instead of breaking', () => {
    expect(members([{ who: 7, amount: '1', share: '' }])).toBeNull();
    expect(members([null])).toBeNull();
    expect(members(['@ana'])).toBeNull();
    expect(members({ who: '@ana' })).toBeNull();
    expect(members([])).toBeNull();
  });
});
