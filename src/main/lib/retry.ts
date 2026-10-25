import { log } from './logger';

export type RetryOptions = {
  /** Maximum number of attempts (default: 3). */
  maxAttempts?: number;
  /** Initial delay in ms before the first retry (default: 1000). */
  initialDelayMs?: number;
  /** Maximum delay in ms between retries (default: 30_000). */
  maxDelayMs?: number;
  /**
   * Stops new attempts when aborted; does not cancel an in-flight `fn`.
   * Before the first attempt, rejects with signal.reason. After an attempt fails,
   * cancellation preserves that failure, including during or just after backoff.
   */
  signal?: AbortSignal;
};

/**
 * Retry `fn` with exponential backoff.
 *
 * Retries errors without a status, rate-limit (429), and server errors (5xx).
 * Client errors (4xx except 429) are re-thrown immediately.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts?: RetryOptions): Promise<T> {
  const { maxAttempts = 3, initialDelayMs = 1_000, maxDelayMs = 30_000 } = opts ?? {};

  opts?.signal?.throwIfAborted();

  let attempt = 0;
  let delay = initialDelayMs;

  for (;;) {
    try {
      return await fn();
    } catch (err: unknown) {
      attempt++;

      const status = (err as { status?: number })?.status;
      const isRetryable = status === undefined || status === 429 || status >= 500;

      if (!isRetryable || attempt >= maxAttempts || opts?.signal?.aborted) {
        throw err;
      }

      log.warn('withRetry: retrying after error', { attempt, status, delay });
      if (opts?.signal?.aborted) throw err;
      await new Promise<void>((resolve, reject) => {
        const signal = opts?.signal;
        const onAbort = () => {
          clearTimeout(id);
          reject(err);
        };
        const id = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        }, delay);
        signal?.addEventListener('abort', onAbort, { once: true });
      });
      if (opts?.signal?.aborted) throw err;
      delay = Math.min(delay * 2, maxDelayMs);
    }
  }
}
