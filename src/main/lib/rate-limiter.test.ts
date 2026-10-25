import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimiter } from './rate-limiter';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
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
});
