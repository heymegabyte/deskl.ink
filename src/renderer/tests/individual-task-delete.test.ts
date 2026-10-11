import type * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReadyTask } from '@renderer/features/projects/components/task-view/task-row';

const mocks = vi.hoisted(() => ({
  manager: { deleteTasks: vi.fn() },
  showDeleteTask: vi.fn(),
  toastError: vi.fn(),
  navigate: vi.fn(),
  activeTaskId: 'task',
  task: {
    state: 'unprovisioned',
    phase: 'idle',
    data: { id: 'task', projectId: 'project', name: 'Task A' },
    conversationStats: {},
  },
}));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }));
vi.mock('mobx-react-lite', () => ({ observer: (component: unknown) => component }));
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof React>()),
  useRef: () => ({ current: false }),
}));
vi.mock('@renderer/features/tasks/stores/task-selectors', () => ({
  getTaskManagerStore: () => mocks.manager,
  getTaskStore: () => mocks.task,
  getWorkspaceForTask: () => undefined,
  getTaskGitStore: () => undefined,
  taskAgentStatus: () => undefined,
}));
vi.mock('@renderer/lib/layout/navigation-provider', () => ({
  useNavigate: () => ({ navigate: mocks.navigate }),
  useWorkspaceSlots: () => ({ currentView: 'task' }),
  useParams: () => ({ params: { taskId: mocks.activeTaskId, projectId: 'project' } }),
}));
vi.mock('@renderer/lib/modal/modal-provider', () => ({
  useShowModal: (id: string) => (id === 'deleteTaskModal' ? mocks.showDeleteTask : vi.fn()),
}));
vi.mock('@renderer/features/tasks/components/task-context-menu', () => ({
  TaskContextMenu: () => null,
}));
vi.mock('@renderer/features/tasks/components/task-git-diff-stats', () => ({
  TaskGitDiffStats: () => null,
}));
vi.mock('@renderer/features/tasks/components/agent-status-indicator', () => ({
  AgentStatusIndicator: () => null,
}));
vi.mock('@renderer/lib/components/agent-logo', () => ({ default: () => null }));
vi.mock('@renderer/lib/components/pr-badge', () => ({ PrBadge: () => null }));
vi.mock('@renderer/lib/ui/relative-time', () => ({ RelativeTime: () => null }));
vi.mock('@renderer/utils/agentConfig', () => ({ agentConfig: {} }));
vi.mock('@renderer/lib/ui/checkbox', () => ({ Checkbox: () => null }));

vi.mock('@renderer/features/sidebar/task-sidebar-agent-status', () => ({
  TaskSidebarAgentStatus: () => null,
}));
vi.mock('@renderer/features/sidebar/sidebar-primitives', () => ({ SidebarMenuRow: () => null }));

import { TaskRow } from '@renderer/features/projects/components/task-view/task-row';
import { SidebarTaskItem } from '@renderer/features/sidebar/task-item';

function row() {
  return TaskRow({
    task: mocks.task as unknown as ReadyTask,
    isSelected: false,
    onToggleSelect: vi.fn(),
  });
}

describe.each(['row', 'sidebar'] as const)('individual task deletion from %s', (surface) => {
  function item() {
    return surface === 'row' ? row() : SidebarTaskItem({ projectId: 'project', taskId: 'task' });
  }
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.activeTaskId = 'task';
    mocks.manager.deleteTasks.mockResolvedValue(undefined);
  });

  function confirmDelete(options = { deleteWorktree: true, deleteBranch: false }) {
    item().props.onDelete();
    const modal = mocks.showDeleteTask.mock.calls[0][0];
    return modal.onSuccess(options);
  }

  it('waits for deletion and reports a deferred rejection only after it fails', async () => {
    let reject!: (reason: Error) => void;
    const pending = new Promise<void>((_resolve, rejectPromise) => {
      reject = rejectPromise;
    });
    mocks.manager.deleteTasks.mockReturnValue(pending);
    let settled = false;
    const completion = confirmDelete().then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(mocks.toastError).not.toHaveBeenCalled();
    if (surface === 'sidebar') {
      expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith('project', { projectId: 'project' });
    }
    reject(new Error('RPC unavailable'));
    await completion;
    expect(settled).toBe(true);
    expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith(
      'Could not delete task. Please try again.'
    );
  });

  it.each(['rejection', 'throw'] as const)('reports a failed delete (%s)', async (failure) => {
    if (failure === 'rejection') {
      mocks.manager.deleteTasks.mockRejectedValue(new Error('RPC unavailable'));
    } else {
      mocks.manager.deleteTasks.mockImplementation(() => {
        throw new Error('RPC unavailable');
      });
    }
    await confirmDelete();
    expect(mocks.toastError).toHaveBeenCalledExactlyOnceWith(
      'Could not delete task. Please try again.'
    );
  });

  it('waits for confirmation before deleting the displayed task', () => {
    item().props.onDelete();
    expect(mocks.manager.deleteTasks).not.toHaveBeenCalled();
    expect(mocks.showDeleteTask).toHaveBeenCalledWith({
      projectId: 'project',
      tasks: [{ taskId: 'task', taskName: 'Task A' }],
      onSuccess: expect.any(Function),
    });
  });

  it('keeps the current view when deleting an inactive task', async () => {
    mocks.activeTaskId = 'another-task';
    await confirmDelete();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it.each([
    { deleteWorktree: true, deleteBranch: true },
    { deleteWorktree: true, deleteBranch: false },
    { deleteWorktree: false, deleteBranch: true },
    { deleteWorktree: false, deleteBranch: false },
  ])('preserves confirmed cleanup options %o and keeps success quiet', async (options) => {
    await confirmDelete(options);
    expect(mocks.manager.deleteTasks).toHaveBeenCalledExactlyOnceWith(['task'], options);
    expect(mocks.toastError).not.toHaveBeenCalled();
    if (surface === 'sidebar') {
      expect(mocks.navigate).toHaveBeenCalledExactlyOnceWith('project', { projectId: 'project' });
    } else {
      expect(mocks.navigate).not.toHaveBeenCalled();
    }
  });
});
