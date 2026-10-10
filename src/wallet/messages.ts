'use client';

import { useTranslations, type Messages } from 'next-intl';
import { useCallback } from 'react';
import { ApiError } from './api';

type ErrorCode = keyof Messages['Errors'];

/**
 * The person's message for any failure (API codes, passkey prompts, bundler errors), from the
 * `Errors` texts of the language in use; a code without its own text says `UNKNOWN`'s.
 */
export function useFailureMessage() {
  const t = useTranslations('Errors');
  return useCallback(
    (error: unknown) => {
      const code = failureCode(error) as ErrorCode;
      return t.has(code) ? t(code) : t('UNKNOWN');
    },
    [t],
  );
}

function failureCode(error: unknown): string {
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    if (cause instanceof ApiError) return cause.code;
    if (cause.name === 'NotAllowedError' || cause.name === 'AbortError') return 'CANCELLED';
    if (cause.name === 'InvalidStateError') return 'PASSKEY_EXISTS';
    const own = /^([A-Z_]+)(?::|$)/.exec(cause.message);
    if (own) return own[1];
    // Paymaster and bundler failures reach viem as HTTP errors carrying our response body.
    const code = /"error_code":"([A-Z_]+)"/.exec(cause.message);
    if (code) return code[1];
  }
  return 'UNKNOWN';
}
