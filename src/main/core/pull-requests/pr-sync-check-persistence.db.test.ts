import type { Octokit } from '@octokit/rest';
import { openFixture, type FixtureDb } from '@tooling/utils/db';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pullRequestChecks, pullRequests } from '@main/db/schema';
import { events } from '@main/lib/events';
import { ok } from '@shared/result';
import { PrSyncEngine } from './pr-sync-engine';

const state = vi.hoisted(() => ({ fixture: undefined as FixtureDb | undefined }));
vi.mock('@main/db/client', () => ({
  get db() {
    if (!state.fixture) throw new Error('Test database is not initialized');
    return state.fixture.db;
  },
}));
vi.mock('@main/core/github/services/octokit-provider', () => ({ getOctokit: vi.fn() }));
vi.mock('@main/db/kv', () => ({ KV: class {} }));
vi.mock('@main/lib/events', () => ({ events: { emit: vi.fn() } }));
vi.mock('@main/lib/logger', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@main/lib/rate-limiter', () => ({ githubRateLimiter: { acquire: vi.fn() } }));

const repositoryUrl = 'https://github.com/acme/repo';
const pullRequestUrl = `${repositoryUrl}/pull/12`;
const otherPullRequestUrl = `${repositoryUrl}/pull/13`;
const previousCheck = {
  id: 'previous',
  pullRequestUrl,
  commitSha: 'previous-sha',
  name: 'previous build',
  status: 'COMPLETED',
  conclusion: 'SUCCESS',
};
function response(nodes: unknown[]) {
  return {
    repository: {
      pullRequest: {
        commits: {
          nodes: [
            {
              commit: {
                oid: 'sha',
                statusCheckRollup: {
                  contexts: {
                    pageInfo: { hasNextPage: false, endCursor: null },
                    nodes,
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
const runningCheck = {
  __typename: 'CheckRun',
  name: 'build',
  status: 'IN_PROGRESS',
  conclusion: null,
};
function setup(nodes: unknown[]) {
  const graphql = vi.fn().mockResolvedValue(response(nodes));
  const engine = new PrSyncEngine(vi.fn().mockResolvedValue(ok({ graphql } as unknown as Octokit)));
  return engine;
}
function checks(url = pullRequestUrl) {
  return state
    .fixture!.db.select()
    .from(pullRequestChecks)
    .where(eq(pullRequestChecks.pullRequestUrl, url))
    .all();
}

describe('check-run replacement persistence', () => {
  beforeEach(async () => {
    state.fixture = await openFixture('empty');
    for (const url of [pullRequestUrl, otherPullRequestUrl]) {
      state.fixture.db
        .insert(pullRequests)
        .values({
          url,
          repositoryUrl,
          identifier: url === pullRequestUrl ? '#12' : '#13',
          baseRefName: 'main',
          baseRefOid: 'base',
          headRepositoryUrl: repositoryUrl,
          headRefName: 'feature',
          headRefOid: 'sha',
          title: 'Test PR',
        })
        .run();
    }
    state.fixture.db
      .insert(pullRequestChecks)
      .values([
        previousCheck,
        { ...previousCheck, id: 'other', pullRequestUrl: otherPullRequestUrl },
      ])
      .run();
    vi.mocked(events.emit).mockClear();
  });
  afterEach(() => {
    state.fixture?.close();
    state.fixture = undefined;
  });

  it.each(['first', 'later'])(
    'rolls back when SQLite rejects the %s replacement row and permits retry',
    async (position) => {
      const rejectedCheck = { ...runningCheck, name: 'rejected' };
      const engine = setup(position === 'first' ? [rejectedCheck] : [runningCheck, rejectedCheck]);
      const previous = checks();
      const otherChecks = checks(otherPullRequestUrl);
      state.fixture!.sqlite.exec(`CREATE TRIGGER reject_check_insert
      BEFORE INSERT ON pull_request_checks WHEN NEW.name = 'rejected'
      BEGIN SELECT RAISE(ABORT, 'replacement rejected'); END;`);

      await expect(engine.syncChecks(pullRequestUrl, 'sha')).resolves.toMatchObject({
        success: false,
        error: { type: 'api_error', message: 'replacement rejected' },
      });
      expect(checks()).toEqual(previous);
      expect(checks(otherPullRequestUrl)).toEqual(otherChecks);
      expect(events.emit).not.toHaveBeenCalled();

      state.fixture!.sqlite.exec('DROP TRIGGER reject_check_insert');
      await expect(engine.syncChecks(pullRequestUrl, 'sha')).resolves.toEqual(ok(true));
      expect(checks().map(({ name }) => name)).toEqual(
        position === 'first' ? ['rejected'] : ['build', 'rejected']
      );
      expect(checks().every(({ commitSha }) => commitSha === 'sha')).toBe(true);
      expect(events.emit).toHaveBeenCalledTimes(1);
    }
  );

  it('replaces a complete snapshot without changing another PR', async () => {
    const engine = setup([
      runningCheck,
      {
        __typename: 'StatusContext',
        context: 'lint',
        state: 'SUCCESS',
        createdAt: '2026-10-29T00:00:00Z',
        targetUrl: null,
      },
    ]);
    await expect(engine.syncChecks(pullRequestUrl, 'sha')).resolves.toEqual(ok(true));
    expect(checks().map(({ name, commitSha }) => ({ name, commitSha }))).toEqual([
      { name: 'build', commitSha: 'sha' },
      { name: 'lint', commitSha: 'sha' },
    ]);
    expect(checks(otherPullRequestUrl)).toHaveLength(1);
  });

  it('commits a verified empty replacement', async () => {
    await expect(setup([]).syncChecks(pullRequestUrl, 'sha')).resolves.toEqual(ok(false));
    expect(checks()).toEqual([]);
    expect(checks(otherPullRequestUrl)).toHaveLength(1);
    expect(events.emit).toHaveBeenCalledTimes(1);
  });
});
