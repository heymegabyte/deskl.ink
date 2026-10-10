import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { HomeOverlay } from './components/HomeOverlay.js';
import { DesktopManager } from './components/DesktopManager.js';
import { CommandPalette } from './components/CommandPalette.js';
import { DistroLogo } from './components/DistroLogo.js';
import { api, type SessionState } from './lib/api.js';
import {
  desktopTestIds,
  type DesktopResource,
  type DesktopStatus,
} from '../../../packages/shared/src/desktop-api';

// Lazy-load the fullscreen VNC view so its chunk (and nothing homepage-WebGL)
// loads only when a desktop is actually opened.
const DesktopFullscreen = lazy(() =>
  import('./routes/DesktopFullscreen.js').then((m) => ({ default: m.DesktopFullscreen }))
);

// A headless server's tab is a terminal-native workspace, not a remote desktop (spec §9).
const ServerWorkspace = lazy(() =>
  import('./routes/ServerWorkspace.js').then((m) => ({ default: m.ServerWorkspace }))
);

/** localStorage key holding the ids of OPEN tabs, so the workspace survives a reload (§35). */
const OPEN_TABS_KEY = 'deskl.ink:open-tab-ids:v1';

/** Reads the `?new=1` PWA shortcut once, before any effect can strip it. */
function readNewParam(): boolean {
  try {
    return new URLSearchParams(window.location.search).has('new');
  } catch {
    return false;
  }
}

/** A computer opened as a tab, plus its freshest VNC ticket. */
interface OpenTab {
  desktop: DesktopResource;
  ticket?: string | undefined;
}

/**
 * Root orchestration + the TAB WORKSPACE (spec §33). The login gate guards EVERYTHING: deskl.ink
 * requires a real account (Google / GitHub / email magic link, M2) — there is no guest access. Only
 * once authenticated is the app shown, and every OPEN computer is a tab. "Home" is the manager grid;
 * opening a computer adds+selects its tab; the active tab shows that computer's desktop.
 *
 * A tab is an open VIEW of a computer — NOT a container and NOT a VNC session (§33). Closing a tab
 * does NOT Stop or Destroy the computer (§35) — it just removes the view.
 */
export function App() {
  // null = still checking the session; false = show the login gate; true = show the app.
  const [authed, setAuthed] = useState<boolean | null>(null);
  // The signed-in identity (email / name / provider) from the SAME session fetch that gates the app —
  // captured here so the header's account menu can show "who am I" without a second /session round-trip.
  const [user, setUser] = useState<SessionState['user']>(undefined);
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null); // null = Home (the grid)
  const [paletteOpen, setPaletteOpen] = useState(false); // ⌘K command palette (§87)
  // Bumping this asks the manager to open its New-computer picker (from the palette / shortcut).
  const [pickerNonce, setPickerNonce] = useState(0);

  // Capture the previously-open tab ids + the ?new shortcut ONCE at first render.
  const savedTabIdsRef = useRef<string[]>(
    ((): string[] => {
      try {
        const s: unknown = JSON.parse(window.localStorage.getItem(OPEN_TABS_KEY) ?? '[]');
        return Array.isArray(s) ? s.filter((x): x is string => typeof x === 'string') : [];
      } catch {
        return [];
      }
    })()
  );
  const newParamRef = useRef<boolean>(readNewParam());

  // Check the auth session on mount (and after an OAuth / magic-link redirect lands back on "/").
  useEffect(() => {
    const controller = new AbortController();
    void api
      .getSession(controller.signal)
      .then((s) => {
        if (controller.signal.aborted) return;
        setAuthed(s.authenticated);
        setUser(s.user); // capture the identity for the header account menu (reused, never refetched)
      })
      .catch(() => {
        if (!controller.signal.aborted) setAuthed(false);
      });
    return () => controller.abort();
  }, []);

  // Sign out: clear the server session, drop local state, return to the gate.
  const signOut = useCallback(() => {
    setTabs([]);
    setActiveId(null);
    setPaletteOpen(false);
    setUser(undefined);
    void api.logout().finally(() => setAuthed(false));
  }, []);

  /** Open (or re-select) a computer as a tab and switch to it. */
  const openDesktop = useCallback((desktop: DesktopResource, ticket?: string) => {
    setTabs((prev) =>
      prev.some((t) => t.desktop.id === desktop.id)
        ? prev.map((t) => (t.desktop.id === desktop.id ? { desktop, ticket: ticket ?? t.ticket } : t))
        : [...prev, { desktop, ticket }]
    );
    setActiveId(desktop.id);
  }, []);

  /** Close a tab (view only — never Stops/Destroys). Falls back to Home if it was active. */
  const closeTab = useCallback((id: string) => {
    setTabs((prev) => prev.filter((t) => t.desktop.id !== id));
    setActiveId((cur) => (cur === id ? null : cur));
  }, []);

  /** Return to Home (the grid) while keeping every tab open. */
  const goHome = useCallback(() => setActiveId(null), []);

  /** From the palette: go Home (where creation lives) AND ask the manager to open its picker. */
  const requestNewComputer = useCallback(() => {
    setActiveId(null);
    setPickerNonce((n) => n + 1);
  }, []);

  /** Reorder tabs by moving `draggedId` to `targetId`'s position (drag-and-drop, §35). The persist
   *  effect saves ids in this order, so a reordered strip survives reload. */
  const reorderTab = useCallback((draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    setTabs((prev) => {
      const from = prev.findIndex((t) => t.desktop.id === draggedId);
      const to = prev.findIndex((t) => t.desktop.id === targetId);
      if (from === -1 || to === -1) return prev;
      const next = prev.slice();
      const [moved] = next.splice(from, 1);
      if (moved) next.splice(to, 0, moved);
      return next;
    });
  }, []);

  // ⌘K / Ctrl+K toggles the command palette — only inside the app (the login gate is the barrier;
  // the palette is an in-app tool). ⌘K is used deliberately (⌘N/⌘W/⌘1-9 collide with browser).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        if (!authed) return;
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [authed]);

  // PWA shortcut: the manifest's "New computer" action launches /?new=1. Once authenticated, open
  // the picker + strip the param so a reload doesn't re-trigger it.
  useEffect(() => {
    if (authed && newParamRef.current) {
      newParamRef.current = false;
      requestNewComputer();
      try {
        window.history.replaceState(null, '', window.location.pathname);
      } catch {
        /* history unavailable — ignore */
      }
    }
  }, [authed, requestNewComputer]);

  // Lock background scroll while the login gate is up (not authenticated).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = authed ? prev : 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [authed]);

  // Persist open tab ids so the workspace survives a reload (§35).
  useEffect(() => {
    try {
      const ids = tabs.map((t) => t.desktop.id);
      if (ids.length) window.localStorage.setItem(OPEN_TABS_KEY, JSON.stringify(ids));
      else window.localStorage.removeItem(OPEN_TABS_KEY);
    } catch {
      // Storage unavailable — tabs are simply session-only.
    }
  }, [tabs]);

  // Restore previously-open tabs on mount: re-fetch each saved id. The persistent signed session
  // cookie keeps this owner-scoped — a deleted / not-owned id 404s and is silently dropped. Lands
  // on Home (doesn't auto-open a desktop) so a reload is calm, not a surprise connect.
  useEffect(() => {
    const ids = savedTabIdsRef.current;
    if (ids.length === 0) return;
    const controller = new AbortController();
    void (async () => {
      const results = await Promise.allSettled(
        ids.map((id) => api.getDesktop(id, controller.signal))
      );
      if (controller.signal.aborted) return;
      const restored = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
      if (restored.length === 0) return;
      setTabs((prev) => {
        const have = new Set(prev.map((t) => t.desktop.id));
        const add = restored.filter((d) => !have.has(d.id)).map((d) => ({ desktop: d }));
        return add.length ? [...prev, ...add] : prev;
      });
    })();
    return () => controller.abort();
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = tabs.find((t) => t.desktop.id === activeId) ?? null;
  const hasTabs = tabs.length > 0;
  // The manager grid is inert while a desktop covers it OR the command palette is open (so focus
  // can't escape behind the modal).
  const managerInert = active !== null || paletteOpen;

  // Still checking the session — a brief branded boot avoids flashing the gate or the app.
  if (authed === null) return <BootScreen />;

  // Not logged in → the login gate. deskl.ink requires a real account — there is no guest access.
  if (!authed) return <HomeOverlay />;

  // Authenticated → the app.
  return (
    <div className="relative h-full">
      {hasTabs && (
        <TabStrip
          tabs={tabs}
          activeId={activeId}
          onSelect={setActiveId}
          onClose={closeTab}
          onHome={goHome}
          onReorder={reorderTab}
        />
      )}

      {/* Home = the desktop manager grid. Pushed below the strip when tabs are open. */}
      <div
        className={hasTabs ? 'absolute inset-x-0 bottom-0 top-9' : 'h-full'}
        aria-hidden={managerInert}
        {...(managerInert ? { inert: true } : {})}
      >
        <DesktopManager
          onOpen={openDesktop}
          onSignOut={signOut}
          onDeleted={closeTab}
          openPickerSignal={pickerNonce}
          user={user}
        />
      </div>

      {/* ⌘K command palette — in-app only, above every surface (z-90). */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpenDesktop={openDesktop}
        onGoHome={goHome}
        onNewComputer={requestNewComputer}
        onSignOut={signOut}
      />

      {/* The active tab's workspace (lazy chunk), filling everything UNDER the tab strip (§38):
          a remote desktop for `desktop` computers, a terminal-native workspace for `server`. */}
      {active && (
        <Suspense fallback={<FullscreenBoot />}>
          {active.desktop.form === 'server' ? (
            <ServerWorkspace
              key={active.desktop.id}
              desktop={active.desktop}
              ticket={active.ticket}
              onExit={goHome}
            />
          ) : (
            <DesktopFullscreen
              key={active.desktop.id}
              desktop={active.desktop}
              ticket={active.ticket}
              onExit={goHome}
            />
          )}
        </Suspense>
      )}
    </div>
  );
}

/** A single state dot — green while the computer is running, muted otherwise. */
function tabDotColor(status: DesktopStatus): { color: string; live: boolean } {
  const live = status === 'ready' || status === 'active';
  if (live) return { color: 'var(--color-success)', live };
  if (status === 'failed') return { color: 'var(--color-danger)', live };
  if (status === 'stopped') return { color: 'var(--color-muted)', live };
  return { color: 'var(--color-warning)', live }; // starting/stopping/restoring/persisting
}

/**
 * The tab strip (spec §33–35): Home + one tab per open computer + New. Each computer tab shows its
 * distro mark, name, a subtle state dot, and a close affordance (close = view only, never Stop).
 */
function TabStrip({
  tabs,
  activeId,
  onSelect,
  onClose,
  onHome,
  onReorder,
}: {
  tabs: OpenTab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onHome: () => void;
  onReorder: (draggedId: string, targetId: string) => void;
}) {
  const dragId = useRef<string | null>(null);
  return (
    <div
      data-testid={desktopTestIds.tabStrip}
      role="tablist"
      aria-label="Open computers"
      className="fixed inset-x-0 top-0 z-[70] flex h-9 items-stretch gap-0.5 border-b border-[var(--color-border)] bg-[var(--color-black)]/90 px-1.5 backdrop-blur"
    >
      <button
        type="button"
        data-testid={desktopTestIds.tabHome}
        role="tab"
        aria-selected={activeId === null}
        onClick={onHome}
        aria-label="Home — all computers"
        className="my-1 inline-flex items-center gap-1.5 rounded-md px-2.5 text-xs font-600 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-cyan)]"
        style={{
          color: activeId === null ? 'var(--color-white)' : 'var(--color-muted)',
          backgroundColor: activeId === null ? 'var(--color-cyan)' + '26' : 'transparent',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 10.5 12 3l9 7.5M5 9.5V20h14V9.5" />
        </svg>
        Home
      </button>

      <div className="flex min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto">
        {tabs.map((t) => {
          const selected = t.desktop.id === activeId;
          const { color, live } = tabDotColor(t.desktop.status);
          return (
            <div
              key={t.desktop.id}
              data-testid={desktopTestIds.tab}
              data-tab-id={t.desktop.id}
              role="tab"
              aria-selected={selected}
              draggable
              onDragStart={() => {
                dragId.current = t.desktop.id;
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const d = dragId.current;
                dragId.current = null;
                if (d) onReorder(d, t.desktop.id);
              }}
              onDragEnd={() => {
                dragId.current = null;
              }}
              className="group my-1 flex min-w-0 max-w-[12rem] cursor-grab items-center gap-1.5 rounded-md pl-2 pr-1 transition-colors active:cursor-grabbing"
              style={{
                backgroundColor: selected ? 'var(--color-cyan)' + '26' : 'transparent',
              }}
            >
              <button
                type="button"
                onClick={() => onSelect(t.desktop.id)}
                aria-label={`Switch to ${t.desktop.name}`}
                className="flex min-w-0 items-center gap-1.5 py-1 text-xs font-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-cyan)]"
                style={{ color: selected ? 'var(--color-white)' : 'var(--color-muted)' }}
              >
                <DistroLogo distro={t.desktop.distro} size={14} />
                <span className="truncate">{t.desktop.name}</span>
                <span
                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: color, boxShadow: live ? `0 0 6px ${color}` : undefined }}
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                data-testid={desktopTestIds.tabClose}
                onClick={() => onClose(t.desktop.id)}
                aria-label={`Close ${t.desktop.name} tab`}
                className="grid h-5 w-5 shrink-0 place-items-center rounded text-[var(--color-muted)] opacity-0 transition-opacity hover:text-white focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-cyan)] group-hover:opacity-100"
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        data-testid={desktopTestIds.tabNew}
        onClick={onHome}
        aria-label="New computer"
        className="my-1 grid w-8 shrink-0 place-items-center rounded-md text-[var(--color-muted)] transition-colors hover:bg-[var(--color-cyan)]/15 hover:text-[var(--color-cyan)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-cyan)]"
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  );
}

/** Brief branded boot while the auth session is checked (avoids flashing the gate or the app). */
function BootScreen() {
  return (
    <div className="ds-nebula-fallback fixed inset-0 z-50 flex items-center justify-center">
      <span
        className="inline-block h-7 w-7 animate-spin rounded-full border-2 border-[var(--color-cyan)] border-t-transparent"
        aria-hidden="true"
      />
      <span className="sr-only">Loading deskl.ink…</span>
    </div>
  );
}

/** Minimal boot screen while the fullscreen chunk loads (no WebGL dep). */
function FullscreenBoot() {
  return (
    <div className="ds-nebula-fallback fixed inset-x-0 bottom-0 top-9 z-[60] flex items-center justify-center">
      <span
        className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-cyan)] border-t-transparent"
        aria-hidden="true"
      />
      <span className="sr-only">Loading desktop…</span>
    </div>
  );
}

export default App;
