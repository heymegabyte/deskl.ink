import { observable, runInAction } from 'mobx';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rpc } from '@renderer/lib/ipc';
import { SnapshotRegistry } from './snapshot-registry';
import { viewStateCache } from './view-state-cache';

vi.mock('@renderer/lib/ipc', () => ({
  rpc: { viewState: { save: vi.fn().mockResolvedValue(undefined), get: vi.fn() } },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});
afterEach(() => {
  viewStateCache.delete('task:replacement');
  vi.useRealTimers();
});

describe('snapshot registration ownership', () => {
  it('keeps the replacement cached when an older owner is disposed', async () => {
    const registry = new SnapshotRegistry();
    const oldState = observable.box('old');
    const newState = observable.box('replacement');
    const disposeOld = registry.register('task:replacement', () => oldState.get());
    const disposeNew = registry.register('task:replacement', () => newState.get());
    try {
      disposeOld();
      disposeOld();
      expect(await viewStateCache.get('task:replacement')).toBe('replacement');
      expect(rpc.viewState.get).not.toHaveBeenCalled();
      runInAction(() => {
        oldState.set('stale write');
        newState.set('fresh write');
      });
      await vi.advanceTimersByTimeAsync(1000);
      expect(rpc.viewState.save).toHaveBeenCalledExactlyOnceWith('task:replacement', 'fresh write');
      expect(await viewStateCache.get('task:replacement')).toBe('fresh write');
      disposeNew();
      await viewStateCache.get('task:replacement');
      expect(rpc.viewState.get).toHaveBeenCalledOnce();
    } finally {
      disposeOld();
      disposeNew();
    }
  });

  it('stops replacement persistence when a third owner takes over after stale disposal', async () => {
    const registry = new SnapshotRegistry();
    const second = observable.box('second');
    const disposeFirst = registry.register('task:replacement', () => 'first');
    const disposeSecond = registry.register('task:replacement', () => second.get());
    disposeFirst();
    const disposeThird = registry.register('task:replacement', () => 'third');
    try {
      runInAction(() => second.set('obsolete'));
      await vi.advanceTimersByTimeAsync(1000);
      expect(rpc.viewState.save).not.toHaveBeenCalled();
      disposeSecond();
      expect(await viewStateCache.get('task:replacement')).toBe('third');
    } finally {
      disposeSecond();
      disposeThird();
    }
  });
});
