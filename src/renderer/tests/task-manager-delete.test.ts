import { runInAction } from 'mobx';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSettingsStore } from '@renderer/features/projects/stores/project-settings-store';
import type { RepositoryStore } from '@renderer/features/projects/stores/repository-store';
import { TaskManagerStore } from '@renderer/features/tasks/stores/task-manager';
import { TaskStore } from '@renderer/features/tasks/stores/task-store';
import type { Task } from '@shared/tasks';

const mocks = vi.hoisted(() => ({
  deleteTasks: vi.fn(),
  releaseConversation: vi.fn(),
  releaseTerminal: vi.fn(),
  releaseWorkspace: vi.fn(),
}));
vi.mock('@renderer/lib/ipc', () => ({
  events: { on: () => () => {} },
  rpc: { tasks: { deleteTasks: mocks.deleteTasks } },
}));
vi.mock('@renderer/features/projects/stores/project-selectors', () => ({
  getProjectManagerStore: vi.fn(),
}));
vi.mock('@renderer/lib/stores/view-state-cache', () => ({ viewStateCache: {} }));
vi.mock('@renderer/features/tasks/stores/conversation-registry', () => ({
  conversationRegistry: { release: mocks.releaseConversation, get: vi.fn() },
}));
vi.mock('@renderer/features/tasks/stores/terminal-registry', () => ({
  terminalRegistry: { release: mocks.releaseTerminal },
}));
vi.mock('@renderer/features/tasks/stores/workspace-registry', () => ({
  workspaceRegistry: { release: mocks.releaseWorkspace },
}));
vi.mock('@renderer/features/tasks/stores/workspace-view-model', () => ({
  WorkspaceViewModel: class {
    dispose = vi.fn();
  },
}));

function setup() {
  const manager = new TaskManagerStore(
    'project',
    { pullRequestRepositoryUrl: null } as unknown as RepositoryStore,
    {} as ProjectSettingsStore,
    'main'
  );
  const data: Task = {
    id: 'task',
    projectId: 'project',
    name: 'Task',
    status: 'todo',
    sourceBranch: undefined,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    statusChangedAt: '2026-01-01',
    isPinned: false,
    prs: [],
    conversations: {},
    workspaceId: 'workspace',
  };
  const task = new TaskStore(data, 'provisioned');
  runInAction(() => {
    task.workspaceId = 'workspace';
    manager.tasks.set('task', task);
  });
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  mocks.deleteTasks.mockReturnValue(
    new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    })
  );
  return { manager, task, resolve, reject };
}

beforeEach(() => vi.resetAllMocks());

describe('TaskManagerStore deletion resource lifetime', () => {
  it('preserves live stores while pending and restores their identity after rejection', async () => {
    const { manager, task, reject } = setup();
    const viewModel = task.viewModel;
    const draftComments = task.draftComments;
    if (!draftComments) throw new Error('Registered task must have draft comments');
    const commentId = draftComments.addComment({
      target: { kind: 'working-tree', group: 'disk', path: 'example.ts' },
      lineNumber: 1,
      content: 'Keep this draft after failed deletion',
    });
    const deletion = manager.deleteTasks(['task']);
    const rejected = expect(deletion).rejects.toThrow('offline');
    expect(manager.tasks.has('task')).toBe(false);
    const pendingViewModel = task.viewModel;
    const pendingDraftComments = task.draftComments;
    const pendingWorkspaceId = task.workspaceId;
    reject(new Error('offline'));
    await rejected;
    expect(pendingViewModel).toBe(viewModel);
    expect(pendingDraftComments).toBe(draftComments);
    expect(pendingWorkspaceId).toBe('workspace');
    expect(manager.tasks.get('task')).toBe(task);
    expect(task.viewModel).toBe(viewModel);
    expect(task.draftComments).toBe(draftComments);
    expect(task.workspaceId).toBe('workspace');
    expect(draftComments.commentsById.get(commentId)?.content).toBe(
      'Keep this draft after failed deletion'
    );
    expect(viewModel?.dispose).not.toHaveBeenCalled();
    expect(mocks.releaseConversation).not.toHaveBeenCalled();
    expect(mocks.releaseTerminal).not.toHaveBeenCalled();
    expect(mocks.releaseWorkspace).not.toHaveBeenCalled();
    manager.dispose();
  });

  it('cleans up once after success even for duplicate task IDs', async () => {
    const { manager, task, resolve } = setup();
    const viewModel = task.viewModel;
    const deletion = manager.deleteTasks(['task', 'task', 'missing']);
    const pendingReleaseCount = mocks.releaseConversation.mock.calls.length;
    resolve();
    await deletion;
    expect(pendingReleaseCount).toBe(0);
    expect(manager.tasks.has('task')).toBe(false);
    expect(viewModel?.dispose).toHaveBeenCalledOnce();
    expect(mocks.releaseConversation).toHaveBeenCalledExactlyOnceWith('task');
    expect(mocks.releaseTerminal).toHaveBeenCalledExactlyOnceWith('task');
    expect(mocks.releaseWorkspace).toHaveBeenCalledExactlyOnceWith('project', 'workspace');
    expect(task.viewModel).toBeNull();
    expect(task.draftComments).toBeNull();
    expect(task.workspaceId).toBeNull();
    manager.dispose();
  });

  it('does not overwrite a newer entry when deletion rejects', async () => {
    const { manager, task, reject } = setup();
    const deletion = manager.deleteTasks(['task']);
    const rejected = expect(deletion).rejects.toThrow('offline');
    const viewModel = task.viewModel;
    const replacement = new TaskStore(task.data, 'unprovisioned');
    runInAction(() => manager.tasks.set('task', replacement));
    reject(new Error('offline'));
    await rejected;
    expect(manager.tasks.get('task')).toBe(replacement);
    expect(viewModel?.dispose).toHaveBeenCalledOnce();
    expect(viewModel?.dispose).toHaveBeenCalledWith({ preserveHistory: true });
    expect(task.draftComments).toBeNull();
    expect(mocks.releaseWorkspace).toHaveBeenCalledExactlyOnceWith('project', 'workspace');
    expect(mocks.releaseConversation).not.toHaveBeenCalled();
    expect(mocks.releaseTerminal).not.toHaveBeenCalled();
    manager.dispose();
  });

  it('preserves the backend error when replaced-store cleanup throws', async () => {
    const { manager, task, reject } = setup();
    const viewModel = task.viewModel;
    if (!viewModel) throw new Error('Provisioned task must have a view model');
    vi.mocked(viewModel.dispose).mockImplementation(() => {
      throw new Error('cleanup failed');
    });
    const deletion = manager.deleteTasks(['task']);
    const rejected = expect(deletion).rejects.toThrow('offline');
    const replacement = new TaskStore(task.data, 'unprovisioned');
    runInAction(() => manager.tasks.set('task', replacement));
    reject(new Error('offline'));
    await rejected;
    expect(manager.tasks.get('task')).toBe(replacement);
    expect(mocks.releaseConversation).not.toHaveBeenCalled();
    expect(mocks.releaseTerminal).not.toHaveBeenCalled();
    manager.dispose();
  });

  it('preserves replacement task registries when deletion succeeds', async () => {
    const { manager, task, resolve } = setup();
    const viewModel = task.viewModel;
    const deletion = manager.deleteTasks(['task']);
    const replacement = new TaskStore(task.data, 'unprovisioned');
    runInAction(() => manager.tasks.set('task', replacement));
    resolve();
    await deletion;
    expect(manager.tasks.get('task')).toBe(replacement);
    expect(mocks.releaseConversation).not.toHaveBeenCalled();
    expect(mocks.releaseTerminal).not.toHaveBeenCalled();
    expect(viewModel?.dispose).toHaveBeenCalledOnce();
    expect(viewModel?.dispose).toHaveBeenCalledWith({ preserveHistory: true });
    manager.dispose();
  });

  it('cleans later tasks when a deleted store fails to dispose', async () => {
    const { manager, task, resolve } = setup();
    const laterTask = new TaskStore({ ...task.data, id: 'later' }, 'provisioned');
    runInAction(() => manager.tasks.set('later', laterTask));
    const laterViewModel = laterTask.viewModel;
    vi.spyOn(task, 'dispose').mockImplementation(() => {
      throw new Error('store cleanup failed');
    });
    const deletion = manager.deleteTasks(['task', 'later']);
    resolve();
    await expect(deletion).resolves.toBeUndefined();
    expect(manager.tasks.size).toBe(0);
    expect(mocks.releaseConversation).toHaveBeenCalledWith('later');
    expect(mocks.releaseTerminal).toHaveBeenCalledWith('later');
    expect(laterViewModel?.dispose).toHaveBeenCalledOnce();
    manager.dispose();
  });

  it('continues cleanup without reporting deletion failure after backend success', async () => {
    const { manager, task, resolve } = setup();
    const laterTask = new TaskStore({ ...task.data, id: 'later' }, 'provisioned');
    runInAction(() => manager.tasks.set('later', laterTask));
    const laterViewModel = laterTask.viewModel;
    mocks.releaseConversation.mockImplementationOnce(() => {
      throw new Error('cleanup failed');
    });
    const deletion = manager.deleteTasks(['task', 'later']);
    resolve();
    await expect(deletion).resolves.toBeUndefined();
    expect(manager.tasks.size).toBe(0);
    expect(mocks.releaseTerminal).toHaveBeenCalledWith('task');
    expect(task.viewModel).toBeNull();
    expect(mocks.releaseConversation).toHaveBeenCalledWith('later');
    expect(mocks.releaseTerminal).toHaveBeenCalledWith('later');
    expect(laterViewModel?.dispose).toHaveBeenCalledOnce();
    expect(mocks.deleteTasks).toHaveBeenCalledExactlyOnceWith(
      'project',
      ['task', 'later'],
      undefined
    );
    manager.dispose();
  });
});
