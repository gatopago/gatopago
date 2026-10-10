import english from '../messages/en.json';
import spanish from '../messages/es.json';
import { ApiError } from './api';

/** The person's messages for every failure code live with the rest of the translations. */
const errors = {
  es: spanish.Errors as Record<string, string>,
  en: english.Errors as Record<string, string>,
};

/** The message for one code. */
function messageFor(code: string, en: boolean): string {
  const table = en ? errors.en : errors.es;
  return table[code] ?? table.UNKNOWN;
}

/** A message for the person for any failure: API codes, passkey prompts and bundler errors. */
export const failureMessage = (error: unknown, en: boolean) => messageFor(failureCode(error), en);

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
