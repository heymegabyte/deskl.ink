import type * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReadyTask } from '@renderer/features/projects/components/task-view/task-row';

const mocks = vi.hoisted(() => ({
  manager: { archiveTask: vi.fn(), restoreTask: vi.fn() },
  toastError: vi.fn(),
  navigate: vi.fn(),
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
  getTaskGitStore: () => undefined,
  getWorkspaceForTask: () => undefined,
  taskAgentStatus: () => undefined,
}));
vi.mock('@renderer/lib/layout/navigation-provider', () => ({
  useNavigate: () => ({ navigate: mocks.navigate }),
  useWorkspaceSlots: () => ({ currentView: 'task' }),
  useParams: () => ({ params: { taskId: 'task', projectId: 'project' } }),
}));
vi.mock('@renderer/lib/modal/modal-provider', () => ({ useShowModal: () => vi.fn() }));
vi.mock('@renderer/features/tasks/components/task-context-menu', () => ({
  TaskContextMenu: () => null,
}));
vi.mock('@renderer/features/tasks/components/task-git-diff-stats', () => ({
  TaskGitDiffStats: () => null,
}));
vi.mock('@renderer/features/tasks/components/agent-status-indicator', () => ({
  AgentStatusIndicator: () => null,
}));
vi.mock('@renderer/features/sidebar/task-sidebar-agent-status', () => ({
  TaskSidebarAgentStatus: () => null,
}));
vi.mock('@renderer/lib/components/agent-logo', () => ({ default: () => null }));
vi.mock('@renderer/lib/components/pr-badge', () => ({ PrBadge: () => null }));
vi.mock('@renderer/lib/ui/relative-time', () => ({ RelativeTime: () => null }));
vi.mock('@renderer/utils/agentConfig', () => ({ agentConfig: {} }));
vi.mock('@renderer/lib/ui/checkbox', () => ({ Checkbox: () => null }));
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

describe('individual task archive and restore errors', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each(['archive', 'restore'] as const)(
    'reports a failed row %s and consumes its rejection',
    async (action) => {
      const method = action === 'archive' ? mocks.manager.archiveTask : mocks.manager.restoreTask;
      const rejected = Promise.reject(new Error('RPC unavailable'));
      method.mockReturnValue(rejected);
      const tree = row();
      await tree.props[action === 'archive' ? 'onArchive' : 'onRestore']();
      expect(method).toHaveBeenCalledWith('task');
      expect(mocks.toastError).toHaveBeenCalledWith(`Could not ${action} task. Please try again.`);
    }
  );

  it('reports a failed sidebar archive and consumes its rejection', async () => {
    const rejected = Promise.reject(new Error('RPC unavailable'));
    mocks.manager.archiveTask.mockReturnValue(rejected);
    const tree = SidebarTaskItem({ projectId: 'project', taskId: 'task' });
    await tree.props.onArchive();
    expect(mocks.manager.archiveTask).toHaveBeenCalledWith('task');
    expect(mocks.toastError).toHaveBeenCalledWith('Could not archive task. Please try again.');
  });

  it('keeps a successful sidebar archive quiet and preserves navigation', async () => {
    mocks.manager.archiveTask.mockResolvedValue(undefined);
    const tree = SidebarTaskItem({ projectId: 'project', taskId: 'task' });
    await tree.props.onArchive();
    expect(mocks.manager.archiveTask).toHaveBeenCalledWith('task');
    expect(mocks.navigate).toHaveBeenCalledWith('project', { projectId: 'project' });
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it.each(['archive', 'restore'] as const)('keeps a successful row %s quiet', async (action) => {
    const tree = row();
    await tree.props[action === 'archive' ? 'onArchive' : 'onRestore']();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
});
