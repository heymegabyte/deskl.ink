import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeleteTaskModal } from '@renderer/features/tasks/delete-task-modal';

const mocks = vi.hoisted(() => ({ preflight: vi.fn() }));
vi.mock('@renderer/lib/ipc', () => ({ rpc: { tasks: { getDeletePreflight: mocks.preflight } } }));
vi.mock('@renderer/features/settings/use-app-settings-key', () => ({
  useAppSettingsKey: () => ({ value: {} }),
}));
vi.mock('@renderer/lib/hooks/useKeyboardShortcuts', () => ({
  getEffectiveHotkey: () => null,
  getHotkeyRegistration: () => 'Enter',
}));
vi.mock('@renderer/lib/ui/shortcut', () => ({ BoundShortcut: () => null }));
vi.mock('@renderer/lib/ui/dialog', () => ({
  DialogHeader: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogTitle: ({ children }: React.PropsWithChildren) => <h2>{children}</h2>,
  DialogContentArea: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DialogFooter: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

describe('delete task preflight failure', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onSuccess = vi.fn();
  const onClose = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
  async function show() {
    await act(async () =>
      root.render(
        <DeleteTaskModal
          projectId="project"
          tasks={[{ taskId: 'a', taskName: 'Task A' }]}
          onSuccess={onSuccess}
          onClose={onClose}
        />
      )
    );
  }
  function button(label: string) {
    const found = [...container.querySelectorAll('button')].find(
      (item) => item.textContent?.trim() === label
    );
    if (!found) throw new Error(`Missing button: ${label}`);
    return found;
  }
  it('blocks deletion after failure, keeps cancellation available and recovers after retry', async () => {
    mocks.preflight.mockRejectedValueOnce(new Error('offline'));
    await show();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Could not check');
    expect(button('Delete').disabled).toBe(true);
    await act(async () => button('Delete').click());
    expect(onSuccess).not.toHaveBeenCalled();
    await act(async () => button('Cancel').click());
    expect(onClose).toHaveBeenCalledOnce();
    let resolve!: (value: { tasks: never[] }) => void;
    mocks.preflight.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      })
    );
    await act(async () => button('Retry').click());
    expect(button('Loading...').disabled).toBe(true);
    await act(async () => resolve({ tasks: [] }));
    expect(button('Delete').disabled).toBe(false);
    await act(async () => button('Delete').click());
    expect(onSuccess).toHaveBeenCalledWith({ deleteWorktree: true, deleteBranch: false });
    expect(mocks.preflight).toHaveBeenNthCalledWith(2, 'project', ['a']);
  });
  it('restores worktree choices and dirty warnings after a successful retry', async () => {
    mocks.preflight.mockRejectedValueOnce(new Error('offline'));
    await show();
    mocks.preflight.mockResolvedValueOnce({
      tasks: [
        {
          taskId: 'a',
          hasWorktree: true,
          hasUncommittedChanges: true,
          hasDeletableBranch: true,
        },
      ],
    });
    await act(async () => button('Retry').click());
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain('Delete worktree');
    expect(container.textContent).toContain('has uncommitted changes that will be lost');
    expect(button('Delete').disabled).toBe(false);
  });
  it('ignores an old failure after the dialog receives another task', async () => {
    let rejectOld!: (error: Error) => void;
    mocks.preflight.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectOld = reject;
      })
    );
    await show();
    mocks.preflight.mockResolvedValueOnce({ tasks: [] });
    await act(async () =>
      root.render(
        <DeleteTaskModal
          projectId="project"
          tasks={[{ taskId: 'b', taskName: 'Task B' }]}
          onSuccess={onSuccess}
          onClose={onClose}
        />
      )
    );
    await act(async () => rejectOld(new Error('old request failed')));
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(button('Delete').disabled).toBe(false);
    expect(mocks.preflight).toHaveBeenLastCalledWith('project', ['b']);
  });
});
