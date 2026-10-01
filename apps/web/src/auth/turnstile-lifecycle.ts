export type ChallengeState = { status: 'loading' | 'error' | 'expired'; token: null } | { status: 'verified'; token: string };

/** Resolved is not terminal: expiry/error MUST invalidate a previously verified token. */
export function createChallengeLifecycle(publish: (state: ChallengeState) => void) {
  let disposed = false;
  let terminal = false;
  return {
    verified(token: string) {
      if (!disposed && !terminal) {
        if (!token.trim() || token.length > 2048) { terminal = true; publish({ status: 'error', token: null }); }
        else publish({ status: 'verified', token });
      }
    },
    invalidate(status: 'error' | 'expired') {
      if (!disposed && !terminal) { terminal = true; publish({ status, token: null }); }
    },
    dispose() { disposed = true; },
  };
}
