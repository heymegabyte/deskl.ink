import { getEventListeners } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withRetry } from './retry';

vi.mock('./logger', () => ({ log: { warn: vi.fn() } }));

describe('withRetry backoff cancellation', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('caps the first backoff as well as subsequent delays', async () => {
    const attempts: number[] = [];
    const fn = vi.fn(async () => {
      attempts.push(Date.now());
      if (attempts.length < 4) throw { status: 503 };
      return 'done';
    });
    const started = Date.now();
    const request = withRetry(fn, {
      initialDelayMs: 1_000,
      maxDelayMs: 100,
      maxAttempts: 4,
    });
    await vi.advanceTimersByTimeAsync(99);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(200);
    await expect(request).resolves.toBe('done');
    expect(attempts.map((time) => time - started)).toEqual([0, 100, 200, 300]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not start an attempt when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const fn = vi.fn().mockResolvedValue('unexpected');

    await expect(withRetry(fn, { signal: controller.signal })).rejects.toBe(
      controller.signal.reason
    );
    expect(fn).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });

  it.each([new Error('cancelled'), null, 'stopped'])(
    'preserves the pre-aborted signal reason %s',
    async (reason) => {
      const controller = new AbortController();
      controller.abort(reason);
      const fn = vi.fn().mockResolvedValue('unexpected');

      await expect(withRetry(fn, { signal: controller.signal })).rejects.toBe(reason);
      expect(fn).not.toHaveBeenCalled();
    }
  );

  it.each([{ status: 503 }, undefined])(
    'preserves failure %s when aborted after backoff resolves but before the continuation',
    async (error) => {
      const controller = new AbortController();
      const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('unexpected');
      const request = withRetry(fn, { signal: controller.signal, initialDelayMs: 100 });
      const rejection = expect(request).rejects.toBe(error);
      await vi.advanceTimersByTimeAsync(0);

      // Resolve the delay without flushing its promise continuation, then cancel.
      vi.advanceTimersByTime(100);
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
      controller.abort(new Error('cancelled'));
      await rejection;
      expect(fn).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it('keeps a successful in-flight result when cancellation cannot stop the operation', async () => {
    const controller = new AbortController();
    let finish!: (value: string) => void;
    const fn = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        })
    );
    const request = withRetry(fn, { signal: controller.signal });
    controller.abort();
    finish('done');
    await expect(request).resolves.toBe('done');
    expect(fn).toHaveBeenCalledTimes(1);
  });

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
