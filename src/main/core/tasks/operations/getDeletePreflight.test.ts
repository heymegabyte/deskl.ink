import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rows: vi.fn(),
  getProject: vi.fn(),
  getWorktree: vi.fn(),
  exec: vi.fn(),
  warn: vi.fn(),
}));
vi.mock('@main/db/client', () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: mocks.rows }) }) }) },
}));
vi.mock('@main/core/projects/project-manager', () => ({
  projectManager: { getProject: mocks.getProject },
}));
vi.mock('@main/lib/logger', () => ({ log: { warn: mocks.warn } }));

import { getDeletePreflight } from './getDeletePreflight';

describe('delete preflight inspection', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.rows
      .mockResolvedValueOnce([{ taskBranch: 'task-branch', sourceBranch: { branch: 'main' } }])
      .mockResolvedValueOnce([]);
    mocks.getProject.mockReturnValue({
      worktreeService: { getWorktree: mocks.getWorktree },
      ctx: { exec: mocks.exec },
    });
    mocks.getWorktree.mockResolvedValue('/repo/task');
    mocks.exec.mockResolvedValue({ stdout: '' });
  });

  it.each(['status', 'lookup'])('rejects a failed worktree %s inspection', async (step) => {
    const error = new Error('inspection unavailable');
    (step === 'status' ? mocks.exec : mocks.getWorktree).mockRejectedValue(error);
    await expect(getDeletePreflight('project', ['task'])).rejects.toThrow('inspection unavailable');
  });

  it('rejects when the project is unavailable for inspection', async () => {
    mocks.getProject.mockReturnValue(undefined);
    await expect(getDeletePreflight('project', ['task'])).rejects.toThrow('Project not found');
  });

  it.each(['', ' M file\n', '?? new-file\n'])('reports inspected status %j', async (stdout) => {
    mocks.exec.mockResolvedValue({ stdout });
    await expect(getDeletePreflight('project', ['task'])).resolves.toEqual({
      tasks: [
        {
          taskId: 'task',
          hasWorktree: true,
          hasUncommittedChanges: !!stdout.trim(),
          hasDeletableBranch: true,
        },
      ],
    });
    expect(mocks.exec).toHaveBeenCalledWith('git', ['-C', '/repo/task', 'status', '--porcelain']);
  });

  it('permits a missing worktree without running status', async () => {
    mocks.getWorktree.mockResolvedValue(undefined);
    await expect(getDeletePreflight('project', ['task'])).resolves.toMatchObject({
      tasks: [{ hasUncommittedChanges: false }],
    });
    expect(mocks.exec).not.toHaveBeenCalled();
  });

  it('rejects a bulk inspection when one task cannot be inspected', async () => {
    mocks.rows
      .mockReset()
      .mockResolvedValueOnce([{ taskBranch: 'first' }])
      .mockResolvedValueOnce([{ taskBranch: 'second' }])
      .mockResolvedValue([]);
    mocks.getWorktree.mockImplementation(async (branch: string) => {
      if (branch === 'second') throw new Error('second worktree unavailable');
      return '/repo/first';
    });
    await expect(getDeletePreflight('project', ['a', 'b'])).rejects.toThrow(
      'second worktree unavailable'
    );
  });

  it('does not require project inspection for a task without a branch', async () => {
    mocks.rows.mockReset().mockResolvedValueOnce([{ taskBranch: null }]);
    await expect(getDeletePreflight('project', ['task'])).resolves.toEqual({
      tasks: [
        {
          taskId: 'task',
          hasWorktree: false,
          hasUncommittedChanges: false,
          hasDeletableBranch: false,
        },
      ],
    });
    expect(mocks.getProject).not.toHaveBeenCalled();
  });

  it('does not inspect a shared branch worktree', async () => {
    mocks.rows
      .mockReset()
      .mockResolvedValueOnce([{ taskBranch: 'shared' }])
      .mockResolvedValueOnce([{ id: 'sibling' }]);
    await expect(getDeletePreflight('project', ['task'])).resolves.toEqual({
      tasks: [
        {
          taskId: 'task',
          hasWorktree: false,
          hasUncommittedChanges: false,
          hasDeletableBranch: false,
        },
      ],
    });
    expect(mocks.getProject).not.toHaveBeenCalled();
  });
});
