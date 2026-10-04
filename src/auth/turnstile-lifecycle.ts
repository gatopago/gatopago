export type ChallengeState =
  | { status: 'loading' | 'error' | 'expired' | 'used'; token: null }
  | { status: 'verified'; token: string };

/** Resolved is not terminal: expiry/error MUST invalidate a previously verified token. */
export function createChallengeLifecycle(publish: (state: ChallengeState) => void) {
  let disposed = false;
  let terminal = false;
  let available: string | null = null;
  return {
    verified(token: string) {
      if (!disposed && !terminal) {
        if (!token.trim() || token.length > 2048) {
          terminal = true;
          publish({ status: 'error', token: null });
        } else {
          available = token;
          publish({ status: 'verified', token });
        }
      }
    },
    invalidate(status: 'error' | 'expired') {
      if (!disposed && !terminal) {
        terminal = true;
        available = null;
        publish({ status, token: null });
      }
    },
    take() {
      if (disposed || terminal || !available) return null;
      const token = available;
      available = null;
      terminal = true;
      publish({ status: 'used', token: null });
      return token;
    },
    dispose() {
      disposed = true;
      available = null;
    },
  };
}
