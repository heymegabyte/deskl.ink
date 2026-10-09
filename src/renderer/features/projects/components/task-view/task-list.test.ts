import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const view = {
    selectedIds: new Set<string>(),
    tab: 'active',
    searchQuery: '',
    setSelectedIds: vi.fn(),
  };
  const manager = { tasks: new Map(), deleteTasks: vi.fn() };
  return { view, manager, showDeleteTask: vi.fn() };
});

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
