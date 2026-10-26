import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { TaskRow, type ReadyTask } from '@renderer/features/projects/components/task-view/task-row';

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), provision: vi.fn(), openPr: vi.fn() }));
vi.mock('@renderer/features/tasks/stores/task-selectors', () => ({
  getTaskManagerStore: () => ({ provisionTask: mocks.provision }),
  getTaskGitStore: () => undefined,
  taskAgentStatus: () => 'completed',
}));
vi.mock('@renderer/lib/layout/navigation-provider', () => ({
  useNavigate: () => ({ navigate: mocks.navigate }),
}));
vi.mock('@renderer/lib/modal/modal-provider', () => ({ useShowModal: () => vi.fn() }));
vi.mock('@renderer/features/tasks/components/task-context-menu', () => ({
  TaskContextMenu: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));
vi.mock('@renderer/features/tasks/components/task-git-diff-stats', () => ({
  TaskGitDiffStats: () => null,
}));
vi.mock('@renderer/features/tasks/components/agent-status-indicator', () => ({
  AgentStatusIndicator: () => <span title="Agent completed">Completed</span>,
}));
vi.mock('@renderer/lib/components/agent-logo', () => ({ default: () => <span>Codex</span> }));
vi.mock('@renderer/lib/components/pr-badge', () => ({
  PrBadge: () => <button onClick={mocks.openPr}>Pull request</button>,
}));
vi.mock('@renderer/lib/ui/relative-time', () => ({ RelativeTime: () => null }));
vi.mock('@renderer/utils/agentConfig', () => ({ agentConfig: { codex: { name: 'Codex' } } }));

describe('task row keyboard controls', () => {
  let container: HTMLDivElement;
  let root: Root;
  const toggle = vi.fn();
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
  async function show(archived = false, withPr = false) {
    const task = {
      state: 'unprovisioned',
      data: {
        id: 'task',
        projectId: 'project',
        name: 'Fix keyboard',
        archivedAt: archived ? '2026-01-01' : null,
        prs: withPr ? [{ status: 'open', updatedAt: '2026-01-01' }] : [],
      },
      conversationStats: { codex: 1 },
    } as unknown as ReadyTask;
    await act(async () =>
      root.render(<TaskRow task={task} isSelected={false} onToggleSelect={toggle} />)
    );
  }
  it('gives selection a task-specific name and keeps it outside navigation', async () => {
    await show();
    const checkbox = container.querySelector<HTMLElement>('[role="checkbox"]')!;
    expect(checkbox.getAttribute('aria-label')).toBe('Select task Fix keyboard');
    expect(checkbox.closest('button')).toBeNull();
    expect(checkbox.parentElement?.className).toContain('group-focus-within:opacity-100');
    checkbox.focus();
    await userEvent.keyboard(' ');
    expect(toggle).toHaveBeenCalledWith(false);
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.provision).not.toHaveBeenCalled();
    await userEvent.keyboard('{Shift>} {/Shift}');
    expect(toggle).toHaveBeenLastCalledWith(true);
    await userEvent.keyboard(' ');
    expect(toggle).toHaveBeenLastCalledWith(false);
  });
  it('opens an active task with Enter through a separate navigation button', async () => {
    await show();
    const button = container.querySelector<HTMLButtonElement>('button')!;
    expect(button.getAttribute('aria-label')).toBe('Open task Fix keyboard');
    button.focus();
    await userEvent.keyboard('{Enter}');
    expect(mocks.provision).toHaveBeenCalledWith('task');
    expect(mocks.navigate).toHaveBeenCalledWith('task', { projectId: 'project', taskId: 'task' });
    expect(toggle).not.toHaveBeenCalled();
  });
  it('keeps archived tasks selectable without offering a dead navigation control', async () => {
    await show(true);
    expect(container.querySelector('[aria-label="Open task Fix keyboard"]')).toBeNull();
    container.querySelector<HTMLElement>('[role="checkbox"]')!.focus();
    await userEvent.keyboard(' ');
    expect(toggle).toHaveBeenCalledWith(false);
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
  it.each([false, true])('keeps PR controls independent (archived: %s)', async (archived) => {
    await show(archived, true);
    const pr = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Pull request'
    )!;
    expect(pr.parentElement?.closest('button')).toBeNull();
    pr.focus();
    await userEvent.keyboard('{Enter}');
    expect(mocks.openPr).toHaveBeenCalledOnce();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.provision).not.toHaveBeenCalled();
    expect(toggle).not.toHaveBeenCalled();
    expect(container.querySelector('[aria-label="Open task Fix keyboard"]') !== null).toBe(
      !archived
    );
  });

  it.each([false, true])(
    'preserves metadata pointer interaction (archived: %s)',
    async (archived) => {
      await show(archived);
      for (const title of ['Agent completed', 'Codex: 1']) {
        mocks.navigate.mockClear();
        mocks.provision.mockClear();
        const metadata = container.querySelector<HTMLElement>(`[title="${title}"]`)!;
        await userEvent.click(metadata);
        expect(mocks.navigate).toHaveBeenCalledTimes(archived ? 0 : 1);
        expect(mocks.provision).toHaveBeenCalledTimes(archived ? 0 : 1);
        expect(toggle).not.toHaveBeenCalled();
      }
    }
  );
});
