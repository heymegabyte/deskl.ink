/**
 * Token-bucket rate limiter.
 *
 * Tokens refill at `refillRate` per second up to `capacity`.
 * Each `acquire()` call consumes one token; if none are available the call
 * waits until one becomes available. An optional signal cancels waiting without
 * consuming a token and rejects with its abort reason.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillRate: number
  ) {
    this.tokens = capacity;
    // Token refill measures elapsed time, independent of system-clock adjustments.
    this.lastRefill = performance.now();
  }

  async acquire(signal?: AbortSignal): Promise<void> {
    while (true) {
      signal?.throwIfAborted();
      this._refill();

      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }

      // Another waiter may consume the next token first; recheck after waking.
      const waitMs = Math.ceil(((1 - this.tokens) / this.refillRate) * 1000);
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', onAbort);
          reject(signal?.reason);
        };
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        }, waitMs);
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    }
  }

  private _refill(): void {
    const now = performance.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}

/** Shared rate limiter for GitHub API calls: burst of 20, sustained 10/sec. */
export const githubRateLimiter = new RateLimiter(20, 10);
