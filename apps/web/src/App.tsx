import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { HomeOverlay } from './components/HomeOverlay.js';
import { DesktopManager } from './components/DesktopManager.js';
import { DistroMark } from './components/DistroMark.js';
import { api } from './lib/api.js';
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

/**
 * localStorage key tracking whether the home overlay was dismissed this
 * session. Milestone 2 ties this to the real auth session instead.
 */
const OVERLAY_DISMISSED_KEY = 'deskl.ink:overlay-dismissed:v1';

/** localStorage key holding the ids of OPEN tabs, so the workspace survives a reload (§35). */
const OPEN_TABS_KEY = 'deskl.ink:open-tab-ids:v1';

/** Reads the dismissed flag safely (SSR/sandboxed storage guarded). */
function readDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(OVERLAY_DISMISSED_KEY) === '1';
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
 * Root orchestration + the TAB WORKSPACE (spec §33): the homepage overlay guards everything, and
 * once inside, every OPEN computer is a tab. "Home" is the manager grid (where you create/see all
 * computers); opening a computer adds+selects its tab; the active tab shows that computer's desktop.
 *
 * A tab is an open VIEW of a computer — NOT a container and NOT a VNC session (§33). Closing a tab
 * does NOT Stop or Destroy the computer (§35) — it just removes the view. Tab state is session-only
 * for now; cross-reload tab restore is a tracked follow-up (§35).
 */
export function App() {
  const [dismissed, setDismissed] = useState<boolean>(readDismissed);
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null); // null = Home (the grid)

  // Capture the previously-open tab ids ONCE at first render — before any effect runs, so the
  // persist effect's empty-state `removeItem` can't wipe them before restore reads them.
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

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(OVERLAY_DISMISSED_KEY, '1');
    } catch {
      // Storage unavailable (private mode / sandbox) — overlay still dismisses.
    }
  }, []);

  // Sign out: drop all tabs, clear the dismiss flag, reopen the overlay.
  const reopenOverlay = useCallback(() => {
    setTabs([]);
    setActiveId(null);
    setDismissed(false);
    try {
      window.sessionStorage.removeItem(OVERLAY_DISMISSED_KEY);
    } catch {
      // Storage unavailable — state reset still reopens the overlay.
    }
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

  // Lock background scroll while the overlay is up.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = dismissed ? prev : 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [dismissed]);

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
  // The manager grid sits below the strip when tabs exist, and is inert while a desktop covers it.
  const managerInert = !dismissed || active !== null;

  return (
    <div className="relative h-full">
      {hasTabs && (
        <TabStrip
          tabs={tabs}
          activeId={activeId}
          onSelect={setActiveId}
          onClose={closeTab}
          onHome={goHome}
        />
      )}

      {/* Home = the desktop manager grid. Pushed below the strip when tabs are open. */}
      <div
        className={hasTabs ? 'absolute inset-x-0 bottom-0 top-9' : 'h-full'}
        aria-hidden={managerInert}
        {...(managerInert ? { inert: true } : {})}
      >
        <DesktopManager onOpen={openDesktop} onSignOut={reopenOverlay} onDeleted={closeTab} />
      </div>

      {!dismissed && <HomeOverlay onDismiss={dismiss} />}

      {/* The active tab's desktop (lazy chunk), filling everything UNDER the tab strip (§38). */}
      {active && (
        <Suspense fallback={<FullscreenBoot />}>
          <DesktopFullscreen
            key={active.desktop.id}
            desktop={active.desktop}
            ticket={active.ticket}
            onExit={goHome}
          />
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
}: {
  tabs: OpenTab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onHome: () => void;
}) {
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
              className="group my-1 flex min-w-0 max-w-[12rem] items-center gap-1.5 rounded-md pl-2 pr-1 transition-colors"
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
                <DistroMark distro={t.desktop.distro} size={14} />
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
