import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TerminalSearchOverlay } from '@renderer/lib/pty/terminal-search-overlay';

describe('terminal search result announcements', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  async function show(query: string, currentIndex = 0, total = 0, isOpen = true) {
    await act(async () => {
      root.render(
        <TerminalSearchOverlay
          isOpen={isOpen}
          searchQuery={query}
          searchStatus={{ found: total > 0, currentIndex, total }}
          searchInputRef={{ current: null }}
          onQueryChange={() => {}}
          onStep={() => {}}
          onClose={() => {}}
        />
      );
    });
  }

  it('keeps a polite, atomic status region mounted with no empty-query announcement', async () => {
    await show('');
    const status = container.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status?.getAttribute('aria-live')).toBe('polite');
    expect(status?.getAttribute('aria-atomic')).toBe('true');
    expect(status?.textContent).toBe('');
    expect(container.textContent).toContain('0/0');
  });

  it('updates the same status region when matching, stepping, finding nothing and clearing', async () => {
    await show('');
    const status = container.querySelector('[role="status"]');
    await show('hello', 1, 3);
    expect(container.querySelector('[role="status"]')).toBe(status);
    expect(status?.textContent).toBe('Match 1 of 3');
    expect(container.querySelector('span[aria-hidden="true"]')?.textContent).toBe('1/3');
    await show('hello', 2, 3);
    expect(status?.textContent).toBe('Match 2 of 3');
    await show('missing');
    expect(status?.textContent).toBe('No matches');
    await show('');
    expect(status?.textContent).toBe('');
  });

  it('does not expose an announcement when the overlay is closed', async () => {
    await show('hello', 1, 1, false);
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});
