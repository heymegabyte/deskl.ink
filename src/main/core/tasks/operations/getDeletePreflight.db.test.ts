import { openFixture, type FixtureDb } from '@tooling/utils/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { projects, tasks } from '@main/db/schema';
import { getDeletePreflight } from './getDeletePreflight';

const state = vi.hoisted(() => ({
  fixture: undefined as FixtureDb | undefined,
  getWorktree: vi.fn(),
  exec: vi.fn(),
}));
vi.mock('@main/db/client', () => ({
  get db() {
    if (!state.fixture) throw new Error('Test database is not initialized');
    return state.fixture.db;
  },
}));
vi.mock('@main/core/projects/project-manager', () => ({
  projectManager: {
    getProject: () => ({
      worktreeService: { getWorktree: state.getWorktree },
      ctx: { exec: state.exec },
    }),
  },
}));
vi.mock('@main/lib/logger', () => ({ log: { warn: vi.fn() } }));

function addTask(id: string, projectId = 'project', sourceBranch = 'main') {
  state
    .fixture!.db.insert(tasks)
    .values({
      id,
      projectId,
      name: id,
      status: 'ready',
      taskBranch: 'shared',
      sourceBranch: { type: 'local', branch: sourceBranch },
    })
    .run();
}

describe('shared worktree delete preflight', () => {
  beforeEach(async () => {
    state.fixture = await openFixture('empty');
    state.fixture.db
      .insert(projects)
      .values([
        { id: 'project', name: 'Project', path: '/repo' },
        { id: 'other', name: 'Other', path: '/other' },
      ])
      .run();
    vi.resetAllMocks();
    state.getWorktree.mockResolvedValue('/pool/shared');
    state.exec.mockResolvedValue({ stdout: ' M important-file\n' });
    addTask('a');
    addTask('b');
  });

  afterEach(() => {
    state.fixture?.close();
    state.fixture = undefined;
  });

  it.each([
    ['a', 'b'],
    ['b', 'a'],
  ])(
    'inspects the dirty worktree when all siblings are selected (%j, %j)',
    async (first, second) => {
      addTask('other-project-task', 'other');
      const result = await getDeletePreflight('project', [first, second]);
      expect(result.tasks).toEqual(
        [first, second].map((taskId) => ({
          taskId,
          hasWorktree: true,
          hasUncommittedChanges: true,
          hasDeletableBranch: true,
        }))
      );
      expect(state.exec).toHaveBeenCalledWith('git', [
        '-C',
        '/pool/shared',
        'status',
        '--porcelain',
      ]);
    }
  );

  it.each([['a'], ['a', 'b']])(
    'keeps the worktree when an unselected sibling remains (%j)',
    async (...selection) => {
      addTask('retained');
      const result = await getDeletePreflight('project', selection);
      expect(
        result.tasks.every(
          (item) => !item.hasWorktree && !item.hasUncommittedChanges && !item.hasDeletableBranch
        )
      ).toBe(true);
      expect(state.getWorktree).not.toHaveBeenCalled();
    }
  );

  it('rejects the entire shared-worktree inspection when status fails', async () => {
    state.exec.mockRejectedValue(new Error('status unavailable'));
    await expect(getDeletePreflight('project', ['a', 'b'])).rejects.toThrow('status unavailable');
  });

  it('inspects changes without offering deletion of the source branch', async () => {
    addTask('source-task', 'project', 'shared');
    const result = await getDeletePreflight('project', ['a', 'b', 'source-task']);
    expect(result.tasks.find((item) => item.taskId === 'source-task')).toEqual({
      taskId: 'source-task',
      hasWorktree: true,
      hasUncommittedChanges: true,
      hasDeletableBranch: false,
    });
  });
});
