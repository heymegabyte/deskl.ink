import { describe, expect, it } from 'vitest';
import { ProjectViewStore } from './project-view';

describe('TaskViewStore tab selection', () => {
  it.each(['active', 'archived'] as const)('clears selection when leaving %s', (tab) => {
    const store = new ProjectViewStore().taskView;
    store.setTab(tab);
    store.toggleSelect('task-1');
    store.toggleSelect('task-2');

    store.setTab(tab === 'active' ? 'archived' : 'active');

    expect(store.selectedIds.size).toBe(0);
    expect(store.lastSelectedId).toBeNull();
  });

  it('preserves selection and its range anchor when setting the current tab', () => {
    const store = new ProjectViewStore().taskView;
    store.toggleSelect('task-1');

    store.setTab('active');

    expect([...store.selectedIds]).toEqual(['task-1']);
    expect(store.lastSelectedId).toBe('task-1');
  });
});

describe('TaskViewStore range selection', () => {
  it('keeps the non-shift click as the range anchor', () => {
    const store = new ProjectViewStore().taskView;
    const ids = ['1', '2', '3', '4', '5'];

    store.toggleSelect('1');
    store.selectRange(ids, '5');
    store.selectRange(ids, '3');

    expect([...store.selectedIds]).toEqual(['1', '2', '3']);
    expect(store.lastSelectedId).toBe('1');
  });
});

describe('TaskViewStore search selection', () => {
  it.each(['active', 'archived'] as const)('clears hidden selections on search in %s', (tab) => {
    const store = new ProjectViewStore().taskView;
    store.setTab(tab);
    store.toggleSelect('task-1');
    store.toggleSelect('task-2');

    store.setSearchQuery('another task');

    expect(store.searchQuery).toBe('another task');
    expect([...store.selectedIds]).toEqual([]);
    expect(store.lastSelectedId).toBeNull();
  });

  it.each(['', 'different task'])('clears selections when changing a search to %j', (query) => {
    const store = new ProjectViewStore().taskView;
    store.setSearchQuery('task');
    store.toggleSelect('task-1');

    store.setSearchQuery(query);

    expect([...store.selectedIds]).toEqual([]);
    expect(store.lastSelectedId).toBeNull();
  });

  it.each(['task', ' TASK ', 'Task'])('preserves selection for equivalent query %j', (query) => {
    const store = new ProjectViewStore().taskView;
    store.setSearchQuery('task');
    store.toggleSelect('task-1');

    store.setSearchQuery(query);

    expect(store.searchQuery).toBe(query);
    expect([...store.selectedIds]).toEqual(['task-1']);
    expect(store.lastSelectedId).toBe('task-1');
  });

  it('starts a fresh range after a search change', () => {
    const store = new ProjectViewStore().taskView;
    store.toggleSelect('old-task');
    store.setSearchQuery('new');

    store.selectRange(['new-1', 'new-2', 'new-3'], 'new-2');
    store.selectRange(['new-1', 'new-2', 'new-3'], 'new-3');

    expect([...store.selectedIds]).toEqual(['new-2', 'new-3']);
    expect(store.lastSelectedId).toBe('new-2');
  });
});

describe('TaskViewStore selection identity', () => {
  it('replaces selection identity even after selecting then deselecting a task', () => {
    const store = new ProjectViewStore().taskView;
    const initial = store.selectedIds;
    store.toggleSelect('task-1');
    const selected = store.selectedIds;
    store.toggleSelect('task-1');
    expect(store.selectedIds).not.toBe(initial);
    expect(store.selectedIds).not.toBe(selected);
    expect([...initial]).toEqual([]);
    expect([...selected]).toEqual(['task-1']);
    expect([...store.selectedIds]).toEqual([]);
    expect(store.lastSelectedId).toBe('task-1');
  });
});
