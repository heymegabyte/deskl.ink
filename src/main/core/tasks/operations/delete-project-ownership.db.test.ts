import { openFixture, type FixtureDb } from '@tooling/utils/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { projects, tasks, workspaces } from '@main/db/schema';
import { TaskService } from '../task-service';
import { deleteTask } from './deleteTask';
import { deleteTasks } from './deleteTasks';
import { getDeletePreflight } from './getDeletePreflight';

const state = vi.hoisted(() => ({
  fixture: undefined as FixtureDb | undefined,
  getProject: vi.fn(),
  teardown: vi.fn(),
  removeWorktree: vi.fn(),
  deleteBranch: vi.fn(),
  getWorktree: vi.fn(),
  exec: vi.fn(),
  delViewState: vi.fn(),
  capture: vi.fn(),
}));
vi.mock('@main/db/client', () => ({
  get db() {
    if (!state.fixture) throw new Error('Test database is not initialized');
    return state.fixture.db;
  },
}));
vi.mock('@main/core/projects/project-manager', () => ({
  projectManager: { getProject: state.getProject },
}));
vi.mock('@main/core/tasks/task-manager', () => ({
  taskManager: { teardownTask: state.teardown },
}));
vi.mock('@main/core/view-state/view-state-service', () => ({
  viewStateService: { del: state.delViewState },
}));
vi.mock('@main/lib/telemetry', () => ({ telemetryService: { capture: state.capture } }));
vi.mock('@main/lib/logger', () => ({ log: { warn: vi.fn() } }));

// Keep the service boundary real without loading provisioning/native integrations.
vi.mock('@main/core/conversations/utils', () => ({ mapConversationRowToConversation: vi.fn() }));
vi.mock('@main/core/ssh/lifecycle/production-ssh-connection-manager', () => ({
  sshConnectionManager: {},
}));
vi.mock('@main/core/terminals/core', () => ({ mapTerminalRowToTerminal: vi.fn() }));
vi.mock('@main/core/workspaces/workspace-bootstrap-service', () => ({
  workspaceBootstrapService: {},
}));
vi.mock('@main/core/workspaces/workspace-registry', () => ({ workspaceRegistry: {} }));
vi.mock('./archiveTask', () => ({ archiveTask: vi.fn() }));
vi.mock('./createTask', () => ({ createTask: vi.fn() }));
vi.mock('./getTasks', () => ({ getTasks: vi.fn() }));
vi.mock('./renameTask', () => ({ renameTask: vi.fn() }));
vi.mock('./restoreTask', () => ({ restoreTask: vi.fn() }));
vi.mock('./setTaskPinned', () => ({ setTaskPinned: vi.fn() }));
vi.mock('./updateLinkedIssue', () => ({ updateLinkedIssue: vi.fn() }));
vi.mock('./updateTaskStatus', () => ({ updateTaskStatus: vi.fn() }));

describe('deletion project ownership', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    state.fixture = await openFixture('empty');
    state.fixture.db
      .insert(projects)
      .values([
        { id: 'owner', name: 'Owner', path: '/owner' },
        { id: 'other', name: 'Other', path: '/other' },
      ])
      .run();
    state.fixture.db.insert(workspaces).values({ id: 'workspace', type: 'local' }).run();
    state.fixture.db
      .insert(tasks)
      .values({
        id: 'task',
        projectId: 'owner',
        name: 'Task',
        status: 'ready',
        workspaceId: 'workspace',
        taskBranch: 'shared-name',
        sourceBranch: { type: 'local', branch: 'main' },
      })
      .run();
    state.getProject.mockReturnValue({
      removeTaskWorktree: state.removeWorktree,
      repository: { deleteBranch: state.deleteBranch },
      worktreeService: { getWorktree: state.getWorktree },
      ctx: { exec: state.exec },
    });
    state.teardown.mockResolvedValue({ success: true });
    state.removeWorktree.mockResolvedValue(undefined);
    state.deleteBranch.mockResolvedValue({ success: true });
    state.getWorktree.mockResolvedValue('/other/shared-name');
    state.exec.mockResolvedValue({ stdout: '' });
  });

  afterEach(() => {
    state.fixture?.close();
    state.fixture = undefined;
  });

  it.each(['delete', 'preflight'] as const)(
    'rejects cross-project %s before touching data or providers',
    async (operation) => {
      const db = state.fixture!.db;
      const beforeTasks = db.select().from(tasks).all();
      const beforeWorkspaces = db.select().from(workspaces).all();
      const request =
        operation === 'delete'
          ? deleteTask('other', 'task', { deleteWorktree: true, deleteBranch: true })
          : getDeletePreflight('other', ['task']);
      await expect(request).rejects.toThrow('Task does not belong to project');
      expect(db.select().from(tasks).all()).toEqual(beforeTasks);
      expect(db.select().from(workspaces).all()).toEqual(beforeWorkspaces);
      for (const fn of [
        state.getProject,
        state.teardown,
        state.removeWorktree,
        state.deleteBranch,
        state.getWorktree,
        state.exec,
        state.delViewState,
        state.capture,
      ]) {
        expect(fn).not.toHaveBeenCalled();
      }
    }
  );

  it('rejects cross-project preflight even without a branch', async () => {
    state.fixture!.db.update(tasks).set({ taskBranch: null }).run();
    await expect(getDeletePreflight('other', ['task'])).rejects.toThrow(
      'Task does not belong to project'
    );
    expect(state.getProject).not.toHaveBeenCalled();
  });

  it.each([
    ['task', 'foreign'],
    ['foreign', 'task'],
  ])(
    'rejects a mixed-project batch before deleting either task (%s first)',
    async (first, second) => {
      const db = state.fixture!.db;
      db.insert(tasks)
        .values({
          id: 'foreign',
          projectId: 'other',
          name: 'Foreign',
          status: 'ready',
        })
        .run();
      const beforeTasks = db.select().from(tasks).all();
      const beforeWorkspaces = db.select().from(workspaces).all();
      const service = new TaskService();
      const onDeleted = vi.fn();
      service.on('task:deleted', onDeleted);
      await expect(
        service.deleteTasks('owner', [first, second], {
          deleteWorktree: true,
          deleteBranch: true,
        })
      ).rejects.toThrow('Task does not belong to project');
      expect(db.select().from(tasks).all()).toEqual(beforeTasks);
      expect(db.select().from(workspaces).all()).toEqual(beforeWorkspaces);
      expect(state.getProject).not.toHaveBeenCalled();
      expect(state.teardown).not.toHaveBeenCalled();
      expect(state.capture).not.toHaveBeenCalled();
      expect(onDeleted).not.toHaveBeenCalled();
    }
  );

  it('preserves owner batch deletion with missing IDs and an empty batch', async () => {
    await deleteTasks('owner', []);
    expect(state.getProject).not.toHaveBeenCalled();
    await deleteTasks('owner', ['missing', 'task'], { deleteWorktree: false });
    expect(state.fixture!.db.select().from(tasks).all()).toEqual([]);
    expect(state.teardown).toHaveBeenCalledWith('task', 'terminate');
  });

  it('emits service deletion hooks after a successful owner batch', async () => {
    const service = new TaskService();
    const onDeleted = vi.fn(() => {
      expect(state.fixture!.db.select().from(tasks).all()).toEqual([]);
    });
    service.on('task:deleted', onDeleted);
    state
      .fixture!.db.insert(tasks)
      .values({
        id: 'second',
        projectId: 'owner',
        name: 'Second',
        status: 'ready',
      })
      .run();

    await service.deleteTasks('owner', ['task', 'second'], { deleteWorktree: false });

    expect(onDeleted.mock.calls).toEqual([
      ['task', 'owner'],
      ['second', 'owner'],
    ]);
    expect(state.teardown).toHaveBeenCalledWith('task', 'terminate');
    expect(state.teardown).toHaveBeenCalledWith('second', 'terminate');
  });

  it('preserves successful owner deletion and cleanup', async () => {
    await deleteTask('owner', 'task', { deleteWorktree: true, deleteBranch: true });
    expect(state.fixture!.db.select().from(tasks).all()).toEqual([]);
    expect(state.fixture!.db.select().from(workspaces).all()).toEqual([]);
    expect(state.teardown).toHaveBeenCalledWith('task', 'terminate');
    expect(state.removeWorktree).toHaveBeenCalledWith('shared-name');
    expect(state.deleteBranch).toHaveBeenCalledWith('shared-name');
    expect(state.delViewState).toHaveBeenCalledWith('task:task');
  });

  it('preserves missing-task no-op behavior', async () => {
    await expect(deleteTask('other', 'missing')).resolves.toBeUndefined();
    await expect(getDeletePreflight('other', ['missing'])).resolves.toEqual({
      tasks: [
        {
          taskId: 'missing',
          hasWorktree: false,
          hasUncommittedChanges: false,
          hasDeletableBranch: false,
        },
      ],
    });
    expect(state.getProject).not.toHaveBeenCalled();
  });
});
