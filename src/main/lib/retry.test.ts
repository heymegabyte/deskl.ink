import { getEventListeners } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withRetry } from './retry';

vi.mock('./logger', () => ({ log: { warn: vi.fn() } }));

describe('withRetry backoff cancellation', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('releases abort listeners after each completed backoff on a shared signal', async () => {
    const controller = new AbortController();
    const unrelatedListener = vi.fn();
    controller.signal.addEventListener('abort', unrelatedListener);

    for (let index = 0; index < 12; index++) {
      const fn = vi.fn().mockRejectedValueOnce({ status: 503 }).mockResolvedValue('done');
      const request = withRetry(fn, { signal: controller.signal, initialDelayMs: 10 });
      await vi.advanceTimersByTimeAsync(0);
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(10);
      await expect(request).resolves.toBe('done');
      expect(fn).toHaveBeenCalledTimes(2);
      expect(getEventListeners(controller.signal, 'abort')).toEqual([unrelatedListener]);
    }
  });

  it('cancels pending backoff without retrying or retaining its timer and listener', async () => {
    const controller = new AbortController();
    const error = { status: 429 };
    const fn = vi.fn().mockRejectedValue(error);
    const request = withRetry(fn, { signal: controller.signal, initialDelayMs: 100 });
    const rejection = expect(request).rejects.toBe(error);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await rejection;
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
