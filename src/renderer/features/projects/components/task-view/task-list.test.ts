import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const view = {
    selectedIds: new Set<string>(),
    tab: 'active',
    searchQuery: '',
    setSelectedIds: vi.fn(),
    setSearchQuery: vi.fn(),
  };
  const manager = { tasks: new Map(), deleteTasks: vi.fn() };
  return { view, manager, showDeleteTask: vi.fn() };
});

// Keep the real task registration guard while isolating Electron-backed store dependencies.
vi.mock('@renderer/lib/ipc', () => ({ rpc: {}, events: {} }));
vi.mock('@renderer/features/tasks/stores/conversation-registry', () => ({
  conversationRegistry: {},
}));
vi.mock('@renderer/features/tasks/stores/workspace-registry', () => ({ workspaceRegistry: {} }));
vi.mock('@renderer/features/tasks/stores/workspace-view-model', () => ({
  WorkspaceViewModel: class {},
}));

vi.mock('mobx-react-lite', () => ({ observer: (component: unknown) => component }));
vi.mock('@tanstack/react-hotkeys', () => ({ useHotkey: vi.fn() }));
vi.mock('@renderer/features/projects/stores/project-selectors', () => ({
  getProjectStore: () => ({ view: { taskView: mocks.view } }),
  asMounted: (store: unknown) => store,
}));
vi.mock('@renderer/features/tasks/stores/task-selectors', () => ({
  getTaskManagerStore: () => mocks.manager,
}));
vi.mock('@renderer/features/settings/use-app-settings-key', () => ({
  useAppSettingsKey: () => ({ value: {} }),
}));
vi.mock('@renderer/lib/hooks/useKeyboardShortcuts', () => ({
  getEffectiveHotkey: () => null,
  getHotkeyRegistration: () => 'Delete',
}));
vi.mock('@renderer/lib/layout/navigation-provider', () => ({
  useParams: () => ({ params: { projectId: 'project' } }),
}));
vi.mock('@renderer/lib/modal/modal-provider', () => ({
  useShowModal: () => mocks.showDeleteTask,
}));
vi.mock('@renderer/lib/modal/modal-store', () => ({ modalStore: { isOpen: false } }));
vi.mock('@renderer/lib/components/list-popover-card', () => ({ ListPopoverCard: () => null }));
vi.mock('@renderer/lib/ui/button', () => ({ Button: () => null }));
vi.mock('@renderer/lib/ui/empty-state', () => ({ EmptyState: () => null }));
vi.mock('@renderer/lib/ui/search-input', () => ({ SearchInput: () => null }));
vi.mock('@renderer/lib/ui/shortcut', () => ({ BoundShortcut: () => null }));
vi.mock('@renderer/lib/ui/toggle-group', () => ({
  ToggleGroup: () => null,
  ToggleGroupItem: () => null,
}));
vi.mock('./task-list-empty-state', () => ({ TaskListEmptyState: () => null }));
vi.mock('./task-row', () => ({ TaskRow: () => null }));

import { TaskList } from './task-list';

function openDeleteConfirmation() {
  const tree = TaskList();
  if (!tree) throw new Error('Expected the mounted task list');
  const selectionBar = tree.props.children.at(-1);
  selectionBar.props.onDelete();
  return mocks.showDeleteTask.mock.calls[0]?.[0];
}

describe('task list deletion confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.view.selectedIds = new Set(['a']);
    mocks.manager.tasks = new Map([
      ['a', { state: 'unprovisioned', data: { id: 'a', name: 'Task A' } }],
      ['b', { state: 'unprovisioned', data: { id: 'b', name: 'Task B' } }],
    ]);
  });

  it.each(['replace', 'clear'])('deletes confirmed tasks when selection changes: %s', (change) => {
    const modal = openDeleteConfirmation();
    expect(modal.tasks).toEqual([{ taskId: 'a', taskName: 'Task A' }]);
    mocks.view.selectedIds = new Set(change === 'replace' ? ['b'] : []);
    modal.onSuccess({ deleteWorktree: false, deleteBranch: true });
    expect(mocks.manager.deleteTasks).toHaveBeenCalledWith(['a'], {
      deleteWorktree: false,
      deleteBranch: true,
    });
  });

  it('excludes missing selected tasks from the confirmed deletion', () => {
    mocks.view.selectedIds = new Set(['a', 'missing']);
    const modal = openDeleteConfirmation();
    expect(modal.tasks).toEqual([{ taskId: 'a', taskName: 'Task A' }]);
    modal.onSuccess({ deleteWorktree: true, deleteBranch: false });
    expect(mocks.manager.deleteTasks).toHaveBeenCalledWith(['a'], {
      deleteWorktree: true,
      deleteBranch: false,
    });
  });

  it.each(['creating', 'create-error'])(
    'excludes unregistered selected tasks in phase %s',
    (phase) => {
      mocks.view.selectedIds = new Set(['a', 'pending']);
      mocks.manager.tasks.set('pending', {
        state: 'unregistered',
        phase,
        data: { id: 'pending', name: 'Pending task' },
      });
      const modal = openDeleteConfirmation();
      expect(modal.tasks).toEqual([{ taskId: 'a', taskName: 'Task A' }]);
      modal.onSuccess({ deleteWorktree: false, deleteBranch: false });
      expect(mocks.manager.deleteTasks).toHaveBeenCalledWith(['a'], {
        deleteWorktree: false,
        deleteBranch: false,
      });
    }
  );

  it.each(['creating', 'create-error'])('does not open confirmation for only %s tasks', (phase) => {
    mocks.manager.tasks.get('a').state = 'unregistered';
    mocks.manager.tasks.get('a').phase = phase;
    expect(openDeleteConfirmation()).toBeUndefined();
    expect(mocks.showDeleteTask).not.toHaveBeenCalled();
    expect(mocks.manager.deleteTasks).not.toHaveBeenCalled();
  });

  it('includes provisioned selected tasks', () => {
    mocks.manager.tasks.get('a').state = 'provisioned';
    const modal = openDeleteConfirmation();
    expect(modal.tasks).toEqual([{ taskId: 'a', taskName: 'Task A' }]);
  });

  it('checks registration when deletion is requested after a selected task transitions', () => {
    const tree = TaskList();
    if (!tree) throw new Error('Expected the mounted task list');
    const selectedTask = mocks.manager.tasks.get('a');
    selectedTask.state = 'unregistered';
    tree.props.children.at(-1).props.onDelete();
    expect(mocks.showDeleteTask).not.toHaveBeenCalled();
    expect(mocks.manager.deleteTasks).not.toHaveBeenCalled();
  });

  it('includes a selected task after it becomes registered', () => {
    const selectedTask = mocks.manager.tasks.get('a');
    selectedTask.state = 'unregistered';
    const tree = TaskList();
    if (!tree) throw new Error('Expected the mounted task list');
    selectedTask.state = 'unprovisioned';
    tree.props.children.at(-1).props.onDelete();
    const modal = mocks.showDeleteTask.mock.calls[0]?.[0];
    expect(modal.tasks).toEqual([{ taskId: 'a', taskName: 'Task A' }]);
  });

  it('does not delete tasks until confirmation succeeds', () => {
    const modal = openDeleteConfirmation();
    expect(modal.tasks).toEqual([{ taskId: 'a', taskName: 'Task A' }]);
    expect(mocks.manager.deleteTasks).not.toHaveBeenCalled();
  });

  it('does not open confirmation when every selected task is missing', () => {
    mocks.view.selectedIds = new Set(['missing']);
    expect(openDeleteConfirmation()).toBeUndefined();
    expect(mocks.showDeleteTask).not.toHaveBeenCalled();
    expect(mocks.manager.deleteTasks).not.toHaveBeenCalled();
  });
});

describe('task list search empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.view.selectedIds = new Set();
    mocks.view.tab = 'active';
    mocks.view.searchQuery = '';
    mocks.manager.tasks = new Map([
      ['a', { state: 'unprovisioned', data: { id: 'a', name: 'Task A' } }],
      [
        'b',
        { state: 'unprovisioned', data: { id: 'b', name: 'Task B', archivedAt: '2026-01-01' } },
      ],
    ]);
  });

  it.each(['active', 'archived'])('offers search recovery for no matches in %s', (tab) => {
    mocks.view.tab = tab;
    mocks.view.searchQuery = ' missing ';
    const body = TaskList()!.props.children[1];
    expect(body.props.label).toBe('No matching tasks');
    expect(body.props.action.props.children).toBe('Clear search');
    body.props.action.props.onClick();
    expect(mocks.view.setSearchQuery).toHaveBeenCalledWith('');
  });

  it('offers search recovery even when the active list is empty', () => {
    mocks.manager.tasks.clear();
    mocks.view.searchQuery = 'missing';
    expect(TaskList()!.props.children[1].props.label).toBe('No matching tasks');
  });

  it('keeps creation onboarding for an empty list with a whitespace-only query', () => {
    mocks.manager.tasks.clear();
    mocks.view.searchQuery = '   ';
    const body = TaskList()!.props.children[1];
    expect(body.props.projectId).toBe('project');
    expect(body.props.label).toBeUndefined();
  });

  it('returns matching tasks after clearing the search', () => {
    mocks.manager.tasks.set('c', { state: 'unprovisioned', data: { id: 'c', name: 'Task C' } });
    mocks.view.searchQuery = ' task a ';
    const body = TaskList()!.props.children[1];
    expect(body.props.tasks.map((task: { data: { id: string } }) => task.data.id)).toEqual(['a']);
    mocks.view.searchQuery = '';
    expect(
      TaskList()!.props.children[1].props.tasks.map(
        (task: { data: { id: string } }) => task.data.id
      )
    ).toEqual(['a', 'c']);
  });
});
