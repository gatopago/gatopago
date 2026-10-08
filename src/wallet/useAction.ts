'use client';

import { useRef, useState } from 'react';
import { failureMessage } from './messages';

/**
 * The busy and error state of a screen's actions: one runs at a time, and a failure becomes a
 * message for the person. `run` resolves whether the action succeeded.
 */
export function useAction(en: boolean) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Checked and set at once, so a second tap before the next render does not start it again.
  const running = useRef(false);

  async function run(action: () => Promise<void>): Promise<boolean> {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
      return true;
    } catch (failure) {
      setError(failureMessage(failure, en));
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return { busy, error, setError, run };
}
