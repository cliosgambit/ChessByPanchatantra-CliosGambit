import { isNonRetryableError } from '../lib/supabase/errors';

/**
 * Retry an async function with exponential backoff.
 * Skips retry for auth/config errors (invalid API key, etc.).
 */
export async function withRetry(fn, { retries = 2, delayMs = 400 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (isNonRetryableError(err)) {
        throw err;
      }
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
      }
    }
  }
  throw lastError;
}
