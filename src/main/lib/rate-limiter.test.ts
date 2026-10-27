import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimiter } from './rate-limiter';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('spaces concurrent waiters instead of sharing one refilled token', async () => {
    const limiter = new RateLimiter(1, 10);
    const acquired: number[] = [];
    const requests = Array.from({ length: 4 }, () =>
      limiter.acquire().then(() => acquired.push(Date.now()))
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(acquired).toEqual([0]);
    await vi.advanceTimersByTimeAsync(100);
    expect(acquired).toEqual([0, 100]);
    await vi.advanceTimersByTimeAsync(100);
    expect(acquired).toEqual([0, 100, 200]);
    await vi.advanceTimersByTimeAsync(100);
    await Promise.all(requests);
    expect(acquired).toEqual([0, 100, 200, 300]);
  });

  it.each([-60_000, 60_000])('ignores a wall-clock adjustment of %i ms', async (adjustment) => {
    const limiter = new RateLimiter(1, 10);
    await limiter.acquire();
    vi.setSystemTime(adjustment);

    let acquired = false;
    const request = limiter.acquire().then(() => {
      acquired = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(acquired).toBe(false);
    await vi.advanceTimersByTimeAsync(99);
    expect(acquired).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(acquired).toBe(true);
    await request;
  });

  it('allows the initial burst but caps tokens accumulated while idle', async () => {
    const limiter = new RateLimiter(2, 10);
    await limiter.acquire();
    await limiter.acquire();
    await vi.advanceTimersByTimeAsync(10_000);

    const acquired: number[] = [];
    const requests = Array.from({ length: 3 }, () =>
      limiter.acquire().then(() => acquired.push(Date.now()))
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(acquired).toEqual([10_000, 10_000]);
    await vi.advanceTimersByTimeAsync(100);
    await Promise.all(requests);
    expect(acquired).toEqual([10_000, 10_000, 10_100]);
  });
  it('rejects pre-aborted requests without consuming a token', async () => {
    const limiter = new RateLimiter(1, 10);
    const controller = new AbortController();
    const reason = new Error('cancelled');
    controller.abort(reason);
    await expect(limiter.acquire(controller.signal)).rejects.toBe(reason);
    await limiter.acquire();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up an aborted waiter without delaying another waiter', async () => {
    const limiter = new RateLimiter(1, 10);
    await limiter.acquire();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const reason = new Error('cancelled');
    const cancelled = expect(limiter.acquire(controller.signal)).rejects.toBe(reason);
    const survivor = limiter.acquire();
    controller.abort(reason);
    await cancelled;
    expect(vi.getTimerCount()).toBe(1);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    await vi.advanceTimersByTimeAsync(100);
    await survivor;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not consume a token when aborted after its timer resolves', async () => {
    const limiter = new RateLimiter(1, 10);
    await limiter.acquire();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const request = limiter.acquire(controller.signal);
    const cancelled = expect(request).rejects.toBe('cancelled');
    vi.advanceTimersByTime(100);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    controller.abort('cancelled');
    await cancelled;
    await limiter.acquire();
    expect(vi.getTimerCount()).toBe(0);
  });
});
