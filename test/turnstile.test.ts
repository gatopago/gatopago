import { describe, expect, it, vi } from 'vitest';
import { createChallengeLifecycle, type ChallengeState } from '../src/auth/turnstile-lifecycle';

describe('Turnstile lifecycle (no external challenge)', () => {
  it.each(['expired', 'error'] as const)(
    'invalidates a previously approved token on %s',
    (reason) => {
      const states: ChallengeState[] = [];
      const challenge = createChallengeLifecycle((state) => states.push(state));
      challenge.verified('one-use-token');
      challenge.invalidate(reason);
      challenge.verified('late-token');
      expect(states).toEqual([
        { status: 'verified', token: 'one-use-token' },
        { status: reason, token: null },
      ]);
    },
  );
  it('ignores all callbacks after unmount and rejects empty tokens', () => {
    const publish = vi.fn();
    const challenge = createChallengeLifecycle(publish);
    challenge.verified('');
    expect(publish).toHaveBeenLastCalledWith({ status: 'error', token: null });
    publish.mockClear();
    challenge.dispose();
    challenge.invalidate('error');
    challenge.verified('late');
    expect(publish).not.toHaveBeenCalled();
  });
  it('consumes each token once and ignores callbacks after consumption', () => {
    const states: ChallengeState[] = [];
    const challenge = createChallengeLifecycle((state) => states.push(state));
    expect(challenge.take()).toBeNull();
    challenge.verified('one-use-token');
    expect(challenge.take()).toBe('one-use-token');
    challenge.verified('late-token');
    challenge.invalidate('expired');
    expect(challenge.take()).toBeNull();
    expect(states).toEqual([
      { status: 'verified', token: 'one-use-token' },
      { status: 'used', token: null },
    ]);
  });
  it.each(['error', 'expired'] as const)('never submits a token after %s', (reason) => {
    const challenge = createChallengeLifecycle(() => undefined);
    challenge.verified('one-use-token');
    challenge.invalidate(reason);
    expect(challenge.take()).toBeNull();
  });
});
