import type { Octokit } from '@octokit/rest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { events } from '@main/lib/events';
import { githubRateLimiter } from '@main/lib/rate-limiter';
import { ok } from '@shared/result';
import { PrSyncEngine } from './pr-sync-engine';

vi.mock('@main/core/github/services/octokit-provider', () => ({ getOctokit: vi.fn() }));
vi.mock('@main/db/client', () => ({ db: {} }));
vi.mock('@main/db/kv', () => ({ KV: class {} }));
vi.mock('@main/lib/events', () => ({ events: { emit: vi.fn() } }));
vi.mock('@main/lib/logger', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@main/lib/rate-limiter', () => ({ githubRateLimiter: { acquire: vi.fn() } }));

const repositoryUrl = 'https://github.com/acme/repo';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function setup() {
  const graphql = vi.fn().mockResolvedValue({ repository: { pullRequest: null } });
  const client = { graphql } as unknown as Octokit;
  const getOctokit = vi.fn().mockResolvedValue(ok(client));
  return { graphql, client, getOctokit, engine: new PrSyncEngine(getOctokit) };
}

describe('single PR refresh cancellation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(githubRateLimiter.acquire).mockReset().mockResolvedValue(undefined);
    vi.mocked(events.emit).mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it('does not acquire a token or request a PR after cancellation during authentication', async () => {
    const { engine, getOctokit, client, graphql } = setup();
    const auth = deferred<ReturnType<typeof ok<Octokit>>>();
    getOctokit.mockReturnValueOnce(auth.promise);
    const first = engine.syncSingle(repositoryUrl, 12);
    const duplicate = engine.syncSingle(repositoryUrl, 12);
    engine.cancel(repositoryUrl);
    auth.resolve(ok(client));

    await expect(first).resolves.toEqual(ok(null));
    await expect(duplicate).resolves.toEqual(ok(null));
    expect(getOctokit).toHaveBeenCalledTimes(1);
    expect(githubRateLimiter.acquire).not.toHaveBeenCalled();
    expect(graphql).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();

    await expect(engine.syncSingle(repositoryUrl, 12)).resolves.toEqual(ok(null));
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it.each(['waiting', 'resolved'])(
    'checks cancellation again when the rate-limit acquisition is %s',
    async (phase) => {
      const { engine, graphql } = setup();
      const token = deferred<void>();
      vi.mocked(githubRateLimiter.acquire).mockReturnValueOnce(token.promise);
      const request = engine.syncSingle(repositoryUrl, 12);
      await vi.waitFor(() => expect(githubRateLimiter.acquire).toHaveBeenCalledTimes(1));
      if (phase === 'resolved') token.resolve();
      engine.cancel(repositoryUrl);
      token.resolve();

      await expect(request).resolves.toEqual(ok(null));
      expect(graphql).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    }
  );

  it('releases a queued refresh on cancellation and allows a fresh refresh', async () => {
    const { engine, graphql } = setup();
    vi.mocked(githubRateLimiter.acquire).mockImplementationOnce(
      (signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
        })
    );
    const request = engine.syncSingle(repositoryUrl, 12);
    await vi.waitFor(() => expect(githubRateLimiter.acquire).toHaveBeenCalledTimes(1));
    expect(githubRateLimiter.acquire).toHaveBeenCalledWith(expect.any(AbortSignal));
    engine.cancel(repositoryUrl);
    await expect(request).resolves.toEqual(ok(null));
    expect(graphql).not.toHaveBeenCalled();
    await expect(engine.syncSingle(repositoryUrl, 12)).resolves.toEqual(ok(null));
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it('consumes an aborted in-flight request rejection without reporting an API failure', async () => {
    const { engine, graphql } = setup();
    graphql.mockImplementationOnce(
      (_query, options) =>
        new Promise((_resolve, reject) => {
          options.request.signal.addEventListener(
            'abort',
            () => reject(options.request.signal.reason),
            { once: true }
          );
        })
    );
    const request = engine.syncSingle(repositoryUrl, 12);
    await vi.waitFor(() => expect(graphql).toHaveBeenCalledTimes(1));
    engine.cancel(repositoryUrl);

    await expect(request).resolves.toEqual(ok(null));
    expect(graphql).toHaveBeenCalledTimes(1);
    expect(events.emit).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ignores authentication setup rejection after repository cancellation', async () => {
    const { engine, getOctokit, graphql } = setup();
    let rejectAuth!: (error: Error) => void;
    getOctokit.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectAuth = reject;
      })
    );
    const request = engine.syncSingle(repositoryUrl, 12);
    engine.cancel(repositoryUrl);
    rejectAuth(new Error('authentication setup failed'));

    await expect(request).resolves.toEqual(ok(null));
    expect(githubRateLimiter.acquire).not.toHaveBeenCalled();
    expect(graphql).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('releases completed refresh controllers and uses a fresh signal for the next refresh', async () => {
    const { engine, graphql } = setup();
    await expect(engine.syncSingle(repositoryUrl, 12)).resolves.toEqual(ok(null));
    const firstSignal = graphql.mock.calls[0][1].request.signal;
    engine.cancel(repositoryUrl);
    expect(firstSignal.aborted).toBe(false);

    await expect(engine.syncSingle(repositoryUrl, 12)).resolves.toEqual(ok(null));
    const nextSignal = graphql.mock.calls[1][1].request.signal;
    expect(nextSignal).not.toBe(firstSignal);
    expect(nextSignal.aborted).toBe(false);
  });

  it('passes cancellation to the in-flight request and ignores a late successful response', async () => {
    const { engine, graphql } = setup();
    const response = deferred<unknown>();
    graphql.mockReturnValueOnce(response.promise);
    const request = engine.syncSingle(repositoryUrl, 12);
    await vi.waitFor(() => expect(graphql).toHaveBeenCalledTimes(1));
    const options = graphql.mock.calls[0][1];
    expect(options.request.signal).toBeInstanceOf(AbortSignal);
    engine.cancel(repositoryUrl);
    expect(options.request.signal.aborted).toBe(true);
    // A non-null response would try to write through the deliberately absent DB mock.
    response.resolve({ repository: { pullRequest: { number: 12 } } });

    await expect(request).resolves.toEqual(ok(null));
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('cancels retry backoff without starting another request', async () => {
    const { engine, graphql } = setup();
    graphql.mockRejectedValueOnce({ status: 503 });
    const request = engine.syncSingle(repositoryUrl, 12);
    await vi.waitFor(() => expect(vi.getTimerCount()).toBe(1));
    engine.cancel(repositoryUrl);

    await expect(request).resolves.toEqual(ok(null));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(graphql).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('only cancels refreshes belonging to the requested repository', async () => {
    const { engine, graphql } = setup();
    const token = deferred<void>();
    vi.mocked(githubRateLimiter.acquire).mockReturnValue(token.promise);
    const cancelled = [engine.syncSingle(repositoryUrl, 12), engine.syncSingle(repositoryUrl, 13)];
    const unaffected = engine.syncSingle('https://github.com/acme/other', 12);
    await vi.waitFor(() => expect(githubRateLimiter.acquire).toHaveBeenCalledTimes(3));
    engine.cancel(repositoryUrl);
    token.resolve();

    await expect(Promise.all(cancelled)).resolves.toEqual([ok(null), ok(null)]);
    await expect(unaffected).resolves.toEqual(ok(null));
    expect(graphql).toHaveBeenCalledTimes(1);
    expect(graphql.mock.calls[0][1]).toMatchObject({ repo: 'other', number: 12 });
  });
});
