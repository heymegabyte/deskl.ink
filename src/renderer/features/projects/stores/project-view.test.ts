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
