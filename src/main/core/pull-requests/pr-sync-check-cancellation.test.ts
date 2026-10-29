import type { Octokit } from '@octokit/rest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { events } from '@main/lib/events';
import { githubRateLimiter } from '@main/lib/rate-limiter';
import { ok } from '@shared/result';
import { PrSyncEngine } from './pr-sync-engine';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  remove: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
}));
vi.mock('@main/db/client', () => ({
  db: { select: mocks.select, delete: mocks.remove, insert: mocks.insert },
}));
vi.mock('@main/db/kv', () => ({ KV: class {} }));
vi.mock('@main/lib/events', () => ({ events: { emit: vi.fn() } }));
vi.mock('@main/lib/logger', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@main/lib/rate-limiter', () => ({ githubRateLimiter: { acquire: vi.fn() } }));

const repositoryUrl = 'https://github.com/acme/repo';
const pullRequestUrl = `${repositoryUrl}/pull/12`;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function selectRows(rows: unknown) {
  const query = {
    where: () => Object.assign(Promise.resolve(rows), { limit: () => rows }),
    innerJoin: () => query,
  };
  return { from: () => query };
}
function setup() {
  const graphql = vi.fn();
  const getOctokit = vi.fn().mockResolvedValue(ok({ graphql } as unknown as Octokit));
  mocks.select.mockImplementation((columns) =>
    selectRows(
      Promise.resolve(
        columns?.commitSha ? [{ commitSha: 'sha' }] : [{ identifier: '#12', repositoryUrl }]
      )
    )
  );
  return { engine: new PrSyncEngine(getOctokit), graphql, getOctokit };
}
function checkResponse(oid: string, hasNextPage = false) {
  return {
    repository: {
      pullRequest: {
        commits: {
          nodes: [
            {
              commit: {
                oid,
                statusCheckRollup: {
                  contexts: {
                    pageInfo: { hasNextPage, endCursor: hasNextPage ? 'next' : null },
                    nodes: [
                      {
                        __typename: 'CheckRun',
                        name: 'build',
                        status: 'IN_PROGRESS',
                        conclusion: null,
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    },
  };
}
describe('check-run cancellation', () => {
  beforeEach(() => {
    mocks.select.mockReset();
    mocks.remove.mockReset().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    mocks.values.mockReset().mockResolvedValue(undefined);
    mocks.insert.mockReset().mockReturnValue({ values: mocks.values });
    vi.mocked(events.emit).mockClear();
    vi.mocked(githubRateLimiter.acquire).mockReset().mockResolvedValue(undefined);
  });
  it('honors repository cancellation during the initial database lookup and permits retry', async () => {
    const { engine, graphql } = setup();
    const lookup = deferred<unknown[]>();
    mocks.select.mockReturnValueOnce(selectRows(lookup.promise));
    const request = engine.syncChecks(pullRequestUrl, 'sha');
    engine.cancel(repositoryUrl);
    lookup.resolve([{ commitSha: 'sha', identifier: '#12', repositoryUrl }]);
    await expect(request).resolves.toEqual(ok(false));
    expect(graphql).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    mocks.select.mockReturnValueOnce(selectRows(Promise.resolve([])));
    await expect(engine.syncChecks(pullRequestUrl, 'sha')).resolves.toEqual(ok(false));
    expect(mocks.select).toHaveBeenCalledTimes(2);
  });
  it.each(['waiting', 'resolved'])(
    'does not request checks after cancellation of a %s token',
    async (phase) => {
      const { engine, graphql } = setup();
      const token = deferred<void>();
      vi.mocked(githubRateLimiter.acquire).mockReturnValueOnce(token.promise);
      const request = engine.syncChecks(pullRequestUrl, 'sha');
      await vi.waitFor(() => expect(githubRateLimiter.acquire).toHaveBeenCalledTimes(1));
      if (phase === 'resolved') token.resolve();
      engine.cancel(repositoryUrl);
      token.resolve();
      await expect(request).resolves.toEqual(ok(false));
      expect(graphql).not.toHaveBeenCalled();
      expect(githubRateLimiter.acquire).toHaveBeenCalledWith(expect.any(AbortSignal));
      expect(mocks.remove).not.toHaveBeenCalled();
    }
  );
  it('releases an abort-aware queued token without a grant and allows a fresh refresh', async () => {
    const { engine, graphql } = setup();
    vi.mocked(githubRateLimiter.acquire).mockImplementationOnce(
      (signal) =>
        new Promise<void>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
        })
    );
    const request = engine.syncChecks(pullRequestUrl, 'sha');
    await vi.waitFor(() => expect(githubRateLimiter.acquire).toHaveBeenCalledTimes(1));
    engine.cancel(repositoryUrl);
    await expect(request).resolves.toEqual(ok(false));
    expect(graphql).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();

    graphql.mockRejectedValueOnce({ status: 403 });
    await expect(engine.syncChecks(pullRequestUrl, 'sha')).resolves.toMatchObject({
      success: false,
      error: { type: 'auth_required' },
    });
    expect(graphql).toHaveBeenCalledTimes(1);
  });
  it('aborts only matching checks, deduplicates until settlement and ignores a late response', async () => {
    const { engine, graphql } = setup();
    const response = deferred<unknown>();
    graphql.mockReturnValue(response.promise);
    const request = engine.syncChecks(pullRequestUrl, 'sha');
    await vi.waitFor(() => expect(graphql).toHaveBeenCalledTimes(1));
    const signal = graphql.mock.calls[0][1].request?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    engine.cancel('https://github.com/acme/other');
    expect(signal.aborted).toBe(false);
    engine.cancel(repositoryUrl);
    expect(signal.aborted).toBe(true);
    const duplicate = engine.syncChecks(pullRequestUrl, 'sha');
    response.resolve({ repository: { pullRequest: null } });
    await expect(request).resolves.toEqual(ok(false));
    await expect(duplicate).resolves.toEqual(ok(false));
    expect(graphql).toHaveBeenCalledTimes(1);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('ignores authentication errors arriving after cancellation', async () => {
    const { engine, getOctokit, graphql } = setup();
    let rejectAuth!: (error: Error) => void;
    getOctokit.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectAuth = reject;
      })
    );
    const request = engine.syncChecks(pullRequestUrl, 'sha');
    await vi.waitFor(() => expect(getOctokit).toHaveBeenCalledTimes(1));
    engine.cancel(repositoryUrl);
    rejectAuth(new Error('auth setup failed'));
    await expect(request).resolves.toEqual(ok(false));
    expect(graphql).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('cancels retry backoff without another request', async () => {
    vi.useFakeTimers();
    try {
      const { engine, graphql } = setup();
      graphql.mockRejectedValueOnce({ status: 503 });
      const request = engine.syncChecks(pullRequestUrl, 'sha');
      await vi.waitFor(() => expect(vi.getTimerCount()).toBe(1));
      engine.cancel(repositoryUrl);
      await expect(request).resolves.toEqual(ok(false));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(graphql).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it('reports ordinary API errors when not cancelled', async () => {
    const { engine, graphql } = setup();
    graphql.mockRejectedValueOnce({ status: 403 });
    const result = await engine.syncChecks(pullRequestUrl, 'sha');
    expect(result).toMatchObject({ success: false, error: { type: 'auth_required' } });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it.each(['cancel', 'failure'])(
    'preserves previous-head checks while a replacement fetch ends in %s',
    async (outcome) => {
      const { engine, graphql } = setup();
      mocks.select.mockImplementation((columns) =>
        selectRows(
          Promise.resolve(
            columns?.commitSha
              ? [{ commitSha: 'previous-sha' }]
              : [{ identifier: '#12', repositoryUrl }]
          )
        )
      );
      const response = deferred<unknown>();
      graphql.mockReturnValueOnce(response.promise);
      const request = engine.syncChecks(pullRequestUrl, 'sha');
      await vi.waitFor(() => expect(graphql).toHaveBeenCalledTimes(1));
      expect(mocks.remove).not.toHaveBeenCalled();
      if (outcome === 'cancel') {
        engine.cancel(repositoryUrl);
        response.resolve(checkResponse('sha'));
      } else {
        response.resolve(Promise.reject({ status: 403 }));
      }
      if (outcome === 'cancel') await expect(request).resolves.toEqual(ok(false));
      else
        await expect(request).resolves.toMatchObject({
          success: false,
          error: { type: 'auth_required' },
        });
      expect(mocks.remove).not.toHaveBeenCalled();
      expect(mocks.values).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    }
  );
  it.each(['different-head', 'missing-pr', 'missing-commit', 'later-page'])(
    'does not replace checks from an unverified commit: %s',
    async (scenario) => {
      const { engine, graphql } = setup();
      if (scenario === 'different-head') graphql.mockResolvedValueOnce(checkResponse('new-sha'));
      if (scenario === 'missing-pr')
        graphql.mockResolvedValueOnce({ repository: { pullRequest: null } });
      if (scenario === 'missing-commit')
        graphql.mockResolvedValueOnce({ repository: { pullRequest: { commits: { nodes: [] } } } });
      if (scenario === 'later-page') {
        graphql.mockResolvedValueOnce(checkResponse('sha', true));
        graphql.mockResolvedValueOnce(checkResponse('new-sha'));
      }
      await expect(engine.syncChecks(pullRequestUrl, 'sha')).resolves.toEqual(ok(false));
      expect(mocks.remove).not.toHaveBeenCalled();
      expect(mocks.values).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
      expect(graphql).toHaveBeenCalledTimes(scenario === 'later-page' ? 2 : 1);
    }
  );
  it.each(['empty-rollup', 'two-pages'])(
    'replaces checks only after a complete verified response: %s',
    async (scenario) => {
      const { engine, graphql } = setup();
      // No stored PR remains by notification time; replacement should still finish.
      mocks.select
        .mockReturnValueOnce(selectRows(Promise.resolve([{ identifier: '#12', repositoryUrl }])))
        .mockReturnValue(selectRows(Promise.resolve([])));
      if (scenario === 'empty-rollup') {
        graphql.mockResolvedValueOnce({
          repository: {
            pullRequest: {
              commits: {
                nodes: [{ commit: { oid: 'sha', statusCheckRollup: null } }],
              },
            },
          },
        });
      } else {
        const secondPage = deferred<unknown>();
        graphql.mockResolvedValueOnce(checkResponse('sha', true));
        graphql.mockReturnValueOnce(secondPage.promise);
        const request = engine.syncChecks(pullRequestUrl, 'sha');
        await vi.waitFor(() => expect(graphql).toHaveBeenCalledTimes(2));
        expect(graphql.mock.calls[1][1].cursor).toBe('next');
        expect(mocks.remove).not.toHaveBeenCalled();
        secondPage.resolve(checkResponse('sha'));
        await expect(request).resolves.toEqual(ok(true));
        expect(mocks.values).toHaveBeenCalledTimes(1);
        expect(mocks.values.mock.calls[0][0]).toHaveLength(2);
      }
      if (scenario === 'empty-rollup') {
        await expect(engine.syncChecks(pullRequestUrl, 'sha')).resolves.toEqual(ok(false));
        expect(mocks.values).not.toHaveBeenCalled();
      }
      expect(mocks.remove).toHaveBeenCalledTimes(1);
    }
  );
  it.each(['none', 'notification', 'replacement'])(
    'completes check replacement and suppresses cancelled notification: %s',
    async (cancelPhase) => {
      const { engine, graphql } = setup();
      const notifyLookup = deferred<unknown[]>();
      const replacement = deferred<void>();
      if (cancelPhase === 'replacement') {
        mocks.remove.mockReturnValueOnce({ where: () => replacement.promise });
      }
      const row = { url: pullRequestUrl, identifier: '#12', repositoryUrl, title: 'Test PR' };
      mocks.select
        .mockReturnValueOnce(selectRows(Promise.resolve([row])))
        .mockReturnValueOnce(selectRows(notifyLookup.promise))
        .mockReturnValue(selectRows(Promise.resolve([])));
      graphql.mockResolvedValueOnce({
        repository: {
          pullRequest: {
            commits: {
              nodes: [
                {
                  commit: {
                    oid: 'sha',
                    statusCheckRollup: {
                      contexts: {
                        pageInfo: { hasNextPage: false },
                        nodes: [
                          {
                            __typename: 'CheckRun',
                            name: 'build',
                            status: 'IN_PROGRESS',
                            conclusion: null,
                          },
                        ],
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      });
      const request = engine.syncChecks(pullRequestUrl, 'sha');
      if (cancelPhase === 'replacement') {
        await vi.waitFor(() => expect(mocks.remove).toHaveBeenCalledTimes(1));
        engine.cancel(repositoryUrl);
        replacement.resolve();
        // Cancellation cannot split an already-started delete/insert replacement.
        await expect(request).resolves.toEqual(ok(false));
      } else {
        await vi.waitFor(() => expect(mocks.select).toHaveBeenCalledTimes(2));
      }
      expect(mocks.values).toHaveBeenCalledWith([
        expect.objectContaining({
          pullRequestUrl,
          commitSha: 'sha',
          name: 'build',
          status: 'IN_PROGRESS',
        }),
      ]);
      const signal = graphql.mock.calls[0][1].request.signal;
      if (cancelPhase === 'notification') engine.cancel(repositoryUrl);
      notifyLookup.resolve([row]);
      await expect(request).resolves.toEqual(ok(cancelPhase === 'none'));
      if (cancelPhase !== 'none') expect(events.emit).not.toHaveBeenCalled();
      else {
        expect(events.emit).toHaveBeenCalledWith(expect.anything(), {
          prs: [expect.objectContaining({ url: pullRequestUrl, title: 'Test PR' })],
        });
        engine.cancel(repositoryUrl);
        expect(signal.aborted).toBe(false);
      }
    }
  );
});
