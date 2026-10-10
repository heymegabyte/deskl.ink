import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const view = {
    selectedIds: new Set<string>(),
    tab: 'active',
    searchQuery: '',
    setSelectedIds: vi.fn(),
    setSearchQuery: vi.fn(),
  };
  const manager = {
    tasks: new Map(),
    deleteTasks: vi.fn(),
    archiveTask: vi.fn(),
    restoreTask: vi.fn(),
  };
  return {
    view,
    manager,
    currentView: null as unknown,
    showDeleteTask: vi.fn(),
    toastError: vi.fn(),
  };
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

vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }));

vi.mock('mobx-react-lite', () => ({ observer: (component: unknown) => component }));
vi.mock('@tanstack/react-hotkeys', () => ({ useHotkey: vi.fn() }));
vi.mock('@renderer/features/projects/stores/project-selectors', () => ({
  getProjectStore: () => ({ view: { taskView: mocks.currentView ?? mocks.view } }),
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

import { ProjectViewStore } from '../../stores/project-view';
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

describe.each([
  ['archive', 'onArchive', 'archiveTask'],
  ['restore', 'onRestore', 'restoreTask'],
] as const)('bulk %s feedback', (action, callback, method) => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.view.selectedIds = new Set(['a', 'b']);
    mocks.view.tab = action === 'archive' ? 'active' : 'archived';
    mocks.view.searchQuery = '';
    mocks.manager.tasks = new Map([
      ['a', { state: 'unprovisioned', data: { id: 'a', name: 'Task A' } }],
      ['b', { state: 'unprovisioned', data: { id: 'b', name: 'Task B' } }],
    ]);
    mocks.manager[method].mockReset().mockResolvedValue(undefined);
    mocks.view.setSelectedIds.mockImplementation((ids: Set<string>) => {
      mocks.view.selectedIds = ids;
    });
  });

  function runAction() {
    const tree = TaskList();
    if (!tree) throw new Error('Expected mounted task list');
    return tree.props.children.at(-1).props[callback]();
  }

  it('clears the completed selection without error feedback', async () => {
    await runAction();
    expect(mocks.manager[method].mock.calls.map(([id]) => id)).toEqual(['a', 'b']);
    expect(mocks.view.setSelectedIds).toHaveBeenCalledWith(new Set());
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('reports partial failure and keeps only failed tasks selected for retry', async () => {
    mocks.manager[method].mockImplementation(async (id: string) => {
      if (id === 'b') throw new Error('backend failure');
    });
    await runAction();
    expect(mocks.view.setSelectedIds).toHaveBeenCalledWith(new Set(['b']));
    expect(mocks.toastError).toHaveBeenCalledWith(
      `Could not ${action} 1 of 2 tasks. Please try again.`
    );
  });

  it('reports complete failure and keeps the failed selection', async () => {
    mocks.manager[method].mockRejectedValue(new Error('backend failure'));
    await runAction();
    expect(mocks.view.setSelectedIds).toHaveBeenCalledWith(new Set(['a', 'b']));
    expect(mocks.toastError).toHaveBeenCalledWith(
      `Could not ${action} 2 of 2 tasks. Please try again.`
    );
  });

  it.each(['replace', 'clear'])('does not overwrite a newer selection: %s', async (change) => {
    let rejectPending!: (reason: Error) => void;
    mocks.manager[method].mockImplementation((id: string) =>
      id === 'b'
        ? new Promise<void>((_, reject) => {
            rejectPending = reject;
          })
        : Promise.resolve()
    );
    const pending = runAction();
    // Allow the operation to start before changing selection.
    await Promise.resolve();
    mocks.view.setSelectedIds.mockClear();
    mocks.view.selectedIds = new Set(change === 'replace' ? ['c'] : []);
    rejectPending(new Error('backend failure'));
    await pending;
    expect(mocks.view.setSelectedIds).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledOnce();
  });

  it('preserves a newer row selection that mutates the same Set', async () => {
    let finish!: () => void;
    mocks.manager[method].mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    mocks.view.selectedIds = new Set(['a']);
    const pending = runAction();
    await Promise.resolve();
    mocks.view.setSelectedIds.mockClear();
    mocks.view.selectedIds.add('c');
    finish();
    await pending;
    expect(mocks.view.setSelectedIds).not.toHaveBeenCalled();
  });

  it('respects selection followed by deselection while failure is pending', async () => {
    const view = new ProjectViewStore().taskView;
    view.setTab(action === 'archive' ? 'active' : 'archived');
    view.setSelectedIds(new Set(['a']));
    mocks.currentView = view;
    let rejectPending!: (reason: Error) => void;
    mocks.manager[method].mockImplementation(
      () =>
        new Promise<void>((_, reject) => {
          rejectPending = reject;
        })
    );
    try {
      const pending = runAction();
      view.toggleSelect('b');
      view.toggleSelect('b');
      rejectPending(new Error('backend failure'));
      await pending;
      expect([...view.selectedIds]).toEqual([]);
      expect(view.lastSelectedId).toBe('b');
      expect(mocks.toastError).toHaveBeenCalledWith(
        `Could not ${action} 1 of 1 tasks. Please try again.`
      );
    } finally {
      mocks.currentView = null;
    }
  });

  it('ignores missing and unregistered selected records', async () => {
    mocks.view.selectedIds = new Set(['a', 'missing', 'pending']);
    mocks.manager.tasks.set('pending', { state: 'unregistered', phase: 'creating' });
    await runAction();
    expect(mocks.manager[method]).toHaveBeenCalledExactlyOnceWith('a');
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
});
