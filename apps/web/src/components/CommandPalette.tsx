import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useFocusTrap } from '../lib/useFocusTrap.js';
import { DISTROS, desktopTestIds, type DesktopResource } from '../../../../packages/shared/src/desktop-api';
import { DistroLogo } from './DistroLogo.js';

/**
 * Command palette (⌘K / Ctrl+K) — fast keyboard navigation to any computer plus quick global
 * actions (spec §87). Opened from App; ⌘K is used (never ⌘N/⌘W/⌘1-9, which collide with browser
 * shortcuts). Self-contained + decoupled: it fetches its own computer list and invokes App's
 * existing handlers, so it touches none of the monitor-critical manager/VNC code.
 *
 * Accessibility: the editable-combobox + listbox pattern — the input is role="combobox" with
 * aria-expanded / aria-controls / aria-activedescendant; the results are a role="listbox" of
 * role="option" rows. Arrow keys move the active option, Enter runs it, Escape closes.
 */
interface Command {
  id: string;
  label: string;
  hint?: string;
  keywords: string;
  icon: React.ReactNode;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onOpenDesktop: (d: DesktopResource) => void;
  onGoHome: () => void;
  onNewComputer: () => void;
  onSignOut: () => void;
}

export function CommandPalette({
  open,
  onClose,
  onOpenDesktop,
  onGoHome,
  onNewComputer,
  onSignOut,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [desktops, setDesktops] = useState<DesktopResource[]>([]);
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  // Modal focus management: contain Tab within the palette + restore focus to the opener on close.
  // (The input's autoFocus keeps initial focus; this adds containment + restore.)
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  // Each time the palette opens: reset, and refresh the computer list (owner-scoped via the cookie).
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setHighlight(0);
    const controller = new AbortController();
    void api
      .listDesktops(controller.signal)
      .then((r) => {
        if (!controller.signal.aborted) setDesktops(r.desktops);
      })
      .catch(() => {
        /* the static actions still work without the list */
      });
    return () => controller.abort();
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    // Computers first (the primary value — jump straight to one), then the global actions.
    const openComputers: Command[] = desktops.map((d) => ({
      id: `open-${d.id}`,
      label: `Open ${d.name}`,
      hint: `${d.form === 'server' ? 'Server' : 'Desktop'} · ${d.os}`,
      keywords: `open switch go to ${d.name} ${d.distro} ${d.os} ${d.form}`,
      // Icon-only: the row shows the DESKTOP name ("Open My Box"), never the distro name, so label
      // the mark with the distro display name ("Ubuntu") to announce it once (no double-announce).
      icon: <DistroLogo distro={d.distro} size={16} label={DISTROS[d.distro].name} />,
      run: () => onOpenDesktop(d),
    }));
    const actions: Command[] = [
      {
        id: 'new',
        label: 'New computer',
        hint: 'Create',
        keywords: 'new create computer add spin up launch',
        icon: <GlyphPlus />,
        run: onNewComputer,
      },
      {
        id: 'home',
        label: 'Go Home',
        hint: 'All computers',
        keywords: 'home grid manager all computers dashboard',
        icon: <GlyphHome />,
        run: onGoHome,
      },
      {
        id: 'signout',
        label: 'Sign out',
        keywords: 'sign out log out logout exit leave',
        icon: <GlyphSignOut />,
        run: onSignOut,
      },
    ];
    return [...openComputers, ...actions];
  }, [desktops, onOpenDesktop, onNewComputer, onGoHome, onSignOut]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => `${c.label} ${c.keywords}`.toLowerCase().includes(q));
  }, [commands, query]);

  // Keep the highlight valid as the filtered set shrinks.
  useEffect(() => {
    setHighlight((h) => (filtered.length === 0 ? 0 : Math.min(h, filtered.length - 1)));
  }, [filtered.length]);

  const runAt = useCallback(
    (i: number) => {
      const cmd = filtered[i];
      if (!cmd) return;
      onClose();
      cmd.run();
    },
    [filtered, onClose]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((h) => (filtered.length ? (h + 1) % filtered.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => (filtered.length ? (h - 1 + filtered.length) % filtered.length : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        runAt(highlight);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [filtered.length, highlight, runAt, onClose]
  );

  // Keep the active option scrolled into view.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${highlight}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  if (!open) return null;

  const activeId = filtered[highlight] ? `cmd-opt-${highlight}` : undefined;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center p-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <button
        type="button"
        aria-label="Close command palette"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-[var(--color-black)]/70 backdrop-blur-sm"
      />

      <div
        ref={dialogRef}
        data-testid={desktopTestIds.commandPalette}
        className="ds-glass relative w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--color-border)] shadow-[0_0_70px_rgba(0,229,255,0.14)] [animation:ds-pop_160ms_var(--ease-expressive)]"
        style={{ animationName: 'ds-pop' }}
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] px-4">
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-[var(--color-muted)]"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            data-testid={desktopTestIds.commandInput}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search computers and actions…"
            aria-label="Search commands"
            role="combobox"
            aria-expanded
            aria-controls="command-list"
            {...(activeId ? { 'aria-activedescendant': activeId } : {})}
            className="w-full bg-transparent py-3.5 text-sm text-white placeholder:text-[var(--color-muted)] outline-none"
          />
          <kbd className="shrink-0 rounded border border-[var(--color-border)] px-1.5 py-0.5 font-mono text-[0.65rem] text-[var(--color-muted)]">
            ESC
          </kbd>
        </div>

        <ul
          ref={listRef}
          id="command-list"
          role="listbox"
          aria-label="Commands"
          className="max-h-[50vh] overflow-y-auto p-1.5"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-[var(--color-muted)]">
              No matching commands
            </li>
          ) : (
            filtered.map((c, i) => (
              <li
                key={c.id}
                id={`cmd-opt-${i}`}
                data-index={i}
                data-testid={desktopTestIds.commandOption}
                data-command={c.id}
                role="option"
                aria-selected={i === highlight}
                onMouseMove={() => setHighlight(i)}
                onClick={() => runAt(i)}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  i === highlight ? 'bg-[var(--color-cyan)]/15' : ''
                }`}
              >
                <span className="grid h-5 w-5 shrink-0 place-items-center text-[var(--color-cyan)]">
                  {c.icon}
                </span>
                <span className="min-w-0 flex-1 truncate text-white">{c.label}</span>
                {c.hint && (
                  <span className="shrink-0 truncate font-mono text-xs text-[var(--color-muted)]">
                    {c.hint}
                  </span>
                )}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

/* --- tiny inline glyphs (aria-hidden; the row label carries the accessible name) --- */
function GlyphPlus() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function GlyphHome() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 10.5 12 3l9 7.5M5 9.5V20h14V9.5" />
    </svg>
  );
}
function GlyphSignOut() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

export default CommandPalette;
