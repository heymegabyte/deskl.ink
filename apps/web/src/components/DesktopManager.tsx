import { useCallback, useEffect, useRef, useState } from 'react';
import {
  desktopTestIds,
  DESKTOP_SIZES,
  estimateDesktopCost,
  type DesktopResource,
  type DesktopStatus,
  type DistroId,
  type DesktopSizeId,
  type ComputerForm,
} from '../../../../packages/shared/src/desktop-api';
import { api, ApiError } from '../lib/api.js';
import { Wordmark } from './Logo.js';
import { OsPicker } from './OsPicker.js';
import { DistroLogo } from './DistroLogo.js';

/**
 * DesktopManager — the authenticated app surface revealed once the homepage
 * overlay is dismissed. Lists the caller's desktops as live tiles, creates new
 * "Everyday" computers, and polls each non-terminal desktop until it's ready.
 *
 * Real-time by design: a visibility-aware poll keeps the grid current (pauses
 * when the tab is hidden, refreshes on focus) — there is no manual refresh.
 */

/** Poll cadence for the desktop list + in-flight desktops (ms). */
const POLL_MS = 2000;

/** Statuses that are still settling — worth polling until they leave this set. */
const TRANSIENT_STATUSES: ReadonlySet<DesktopStatus> = new Set<DesktopStatus>([
  'restoring',
  'starting',
  'stopping',
  'persisting',
]);

/** Compact relative time ("just now" / "4m ago" / "2h ago" / "3d ago") for tile metadata. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/** Map a lifecycle status to a dot color token + a human label. */
function statusPresentation(status: DesktopStatus): {
  color: string;
  label: string;
  live: boolean;
} {
  switch (status) {
    case 'ready':
    case 'active':
      return {
        color: 'var(--color-success)',
        label: status === 'active' ? 'Active' : 'Ready',
        live: true,
      };
    case 'restoring':
      return { color: 'var(--color-warning)', label: 'Restoring', live: false };
    case 'starting':
      return { color: 'var(--color-warning)', label: 'Starting', live: false };
    case 'stopping':
      return { color: 'var(--color-warning)', label: 'Stopping', live: false };
    case 'persisting':
      return { color: 'var(--color-warning)', label: 'Saving', live: false };
    case 'failed':
      return { color: 'var(--color-danger)', label: 'Failed', live: false };
    case 'stopped':
    default:
      return { color: 'var(--color-muted)', label: 'Stopped', live: false };
  }
}

interface DesktopManagerProps {
  /** Open a desktop as a tab. `ticket` is the freshest known. */
  onOpen: (desktop: DesktopResource, ticket?: string) => void;
  /** Sign out / return to the homepage overlay. */
  onSignOut: () => void;
  /** A computer was destroyed → close its tab if open. */
  onDeleted?: (id: string) => void;
  /** Bumped by the command palette to request opening the New-computer picker. */
  openPickerSignal?: number;
}

export function DesktopManager({
  onOpen,
  onSignOut,
  onDeleted,
  openPickerSignal,
}: DesktopManagerProps) {
  const [desktops, setDesktops] = useState<DesktopResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [confirmStopAll, setConfirmStopAll] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  // Polite screen-reader announcements for successful lifecycle actions (WCAG 4.1.3 Status
  // Messages). Errors are announced separately via the role="alert" error banner below.
  const [announcement, setAnnouncement] = useState('');

  // Freshest VNC ticket per desktop, captured at create time. Opening a tile
  // forwards it so the fullscreen view can connect without re-minting.
  const ticketsRef = useRef<Map<string, string>>(new Map());

  // Client-side TOMBSTONES — ids the user deleted this session. A delete can race an in-flight list
  // poll whose response still contains the just-removed computer; without this guard that stale
  // response reinserts the tile (the "disappears → reappears → disappears" flicker). Every list
  // reconcile (`refresh`) filters these out, so a deleted computer can NEVER be resurrected by a
  // stale/late/mid-cleanup response. Authoritative on the client for the session.
  const tombstonedRef = useRef<Set<string>>(new Set());

  // The command palette (via App) requests the New-computer picker by bumping this signal.
  useEffect(() => {
    if (openPickerSignal) setPickerOpen(true);
  }, [openPickerSignal]);

  /** Pull the full desktop list and reconcile into state. */
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const { desktops: next } = await api.listDesktops(signal);
      if (signal?.aborted) return;
      // Drop any tombstoned (user-deleted) id so a stale / in-flight / mid-cleanup response can
      // never resurrect it — the delete is authoritative on the client the moment it's requested.
      const tombstones = tombstonedRef.current;
      setDesktops(tombstones.size ? next.filter((d) => !tombstones.has(d.id)) : next);
      setError(null);
    } catch (err) {
      if (signal?.aborted) return;
      // A transient list failure shouldn't wipe the grid — keep the last good
      // state and surface a quiet message.
      setError(err instanceof ApiError ? err.message : 'Could not load your computers.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  // Visibility-aware polling: refresh on mount, on a timer, and on tab focus;
  // pause the timer while the tab is hidden. No manual refresh button.
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setInterval> | undefined;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        void refresh(controller.signal);
      }, POLL_MS);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        void refresh(controller.signal);
        start();
      }
    };

    void refresh(controller.signal);
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      controller.abort();
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  /** Create an Everyday desktop, show it optimistically, poll until ready. */
  const createComputer = useCallback(
    async (
      distro: DistroId = 'ubuntu',
      size: DesktopSizeId = 'everyday',
      form: ComputerForm = 'desktop'
    ) => {
      if (creating) return;
      setCreating(true);
      setError(null);
      try {
        const { desktop, vncTicket } = await api.createDesktop({
          size,
          distro,
          form,
          disposable: false,
        });
        ticketsRef.current.set(desktop.id, vncTicket);
        // Optimistic insert (dedupe if a poll already surfaced it).
        setDesktops((prev) => {
          if (prev.some((d) => d.id === desktop.id)) {
            return prev.map((d) => (d.id === desktop.id ? desktop : d));
          }
          return [desktop, ...prev];
        });
        setPickerOpen(false);
        setAnnouncement(`${desktop.name} created and starting.`);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not create a computer.');
      } finally {
        setCreating(false);
      }
    },
    [creating]
  );

  /** Poll any individual desktop that is still settling, until it stabilizes. */
  useEffect(() => {
    const settling = desktops.filter((d) => TRANSIENT_STATUSES.has(d.status));
    if (settling.length === 0) return;

    const controller = new AbortController();
    const timer = setInterval(() => {
      for (const d of settling) {
        void api
          .getDesktop(d.id, controller.signal)
          .then((fresh) => {
            if (controller.signal.aborted) return;
            setDesktops((prev) => prev.map((p) => (p.id === fresh.id ? fresh : p)));
          })
          .catch(() => {
            /* transient — the list poll will reconcile */
          });
      }
    }, POLL_MS);

    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [desktops]);

  /** Stop a running desktop (optimistic → reconcile from the response). */
  const stopComputer = useCallback(
    async (id: string) => {
      setDesktops((prev) => prev.map((d) => (d.id === id ? { ...d, status: 'stopping' } : d)));
      try {
        const fresh = await api.stopDesktop(id);
        setDesktops((prev) => prev.map((d) => (d.id === fresh.id ? fresh : d)));
        setAnnouncement(`${fresh.name} stopped.`);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not stop the computer.');
        void refresh();
      }
    },
    [refresh]
  );

  /** Stop EVERY running computer (spec §40 — "stop everything costing money"). */
  const stopAll = useCallback(async () => {
    setConfirmStopAll(false);
    const running = desktops.filter((d) => RUNNING_STATUSES.has(d.status));
    if (running.length === 0) return;
    const ids = new Set(running.map((d) => d.id));
    setAnnouncement(`Stopping ${running.length} computer${running.length === 1 ? '' : 's'}.`);
    setDesktops((prev) => prev.map((d) => (ids.has(d.id) ? { ...d, status: 'stopping' } : d)));
    await Promise.allSettled(running.map((d) => api.stopDesktop(d.id)));
    void refresh();
  }, [desktops, refresh]);

  /** Delete a desktop after confirmation; remove its tile optimistically. */
  const deleteComputer = useCallback(
    async (id: string) => {
      setPendingDelete(null);
      const prevList = desktops;
      const removedName = desktops.find((d) => d.id === id)?.name ?? 'Computer';
      // TOMBSTONE before the optimistic removal, so any list poll resolving between now and backend
      // cleanup can't reinsert this id. `deleteDesktop` is idempotent server-side.
      tombstonedRef.current.add(id);
      setDesktops((prev) => prev.filter((d) => d.id !== id));
      ticketsRef.current.delete(id);
      try {
        await api.deleteDesktop(id);
        setAnnouncement(`${removedName} deleted.`);
        onDeleted?.(id); // close its tab if open (view follows the resource)
      } catch (err) {
        // The delete failed → the computer still exists. Un-tombstone + restore it so the grid is honest.
        tombstonedRef.current.delete(id);
        setError(err instanceof ApiError ? err.message : 'Could not delete the computer.');
        setDesktops(prevList);
      }
    },
    [desktops, onDeleted]
  );

  /** Rename a computer (metadata only). Optimistic → reconcile; revert + surface on failure. */
  const renameComputer = useCallback(
    async (id: string, name: string) => {
      setRenaming(null);
      const trimmed = name.trim();
      const current = desktops.find((d) => d.id === id);
      if (!current || !trimmed || trimmed === current.name) return; // no-op on empty / unchanged
      setDesktops((prev) => prev.map((d) => (d.id === id ? { ...d, name: trimmed } : d)));
      try {
        const fresh = await api.renameDesktop(id, trimmed);
        setDesktops((prev) => prev.map((d) => (d.id === fresh.id ? fresh : d)));
        setAnnouncement(`Renamed to ${fresh.name}.`);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not rename the computer.');
        setDesktops((prev) => prev.map((d) => (d.id === id ? current : d))); // revert
      }
    },
    [desktops]
  );

  const isEmpty = !loading && desktops.length === 0;
  const runningCount = desktops.filter((d) => RUNNING_STATUSES.has(d.status)).length;

  return (
    <div className="ds-nebula-fallback flex h-full flex-col">
      {/* Page heading for assistive tech (the visible brand is the Wordmark logo). */}
      <h1 className="sr-only">Your computers</h1>
      {/* Polite status announcer (WCAG 4.1.3) — created/stopped/deleted/renamed outcomes for SR users. */}
      <div
        data-testid={desktopTestIds.statusAnnouncer}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>
      {pickerOpen && (
        <OsPicker
          onCreate={(distro, size, form) => void createComputer(distro, size, form)}
          onClose={() => setPickerOpen(false)}
          creating={creating}
        />
      )}
      {/* Top bar */}
      <header className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-4 py-4 sm:px-6">
        <Wordmark size={30} textClassName="text-lg" />

        <div className="flex items-center gap-3">
          <FinancialBar desktops={desktops} />

          {/* Stop everything costing money (spec §40) — appears only while something is running. */}
          {runningCount > 0 &&
            (confirmStopAll ? (
              <div className="hidden items-center gap-1.5 sm:inline-flex">
                <button
                  type="button"
                  data-testid={desktopTestIds.stopAllConfirm}
                  onClick={() => void stopAll()}
                  className="rounded-lg bg-[var(--color-warning)] px-3 py-2 text-xs font-700 text-[var(--color-black)] transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-warning)]"
                >
                  {`Stop ${runningCount}?`}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmStopAll(false)}
                  className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-600 text-[var(--color-muted)] transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cyan)]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                data-testid={desktopTestIds.stopAll}
                onClick={() => setConfirmStopAll(true)}
                aria-label="Stop all running computers"
                className="hidden items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-600 text-[var(--color-muted)] transition-colors hover:border-[var(--color-warning)]/60 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cyan)] sm:inline-flex"
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
                  <rect x="7" y="7" width="10" height="10" rx="1.5" />
                </svg>
                Stop all
              </button>
            ))}

          <button
            type="button"
            data-testid={desktopTestIds.newComputerButton}
            onClick={() => setPickerOpen(true)}
            disabled={creating}
            aria-label="Create a new computer"
            aria-busy={creating}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-cyan)] px-3 py-2.5 text-sm font-700 text-[var(--color-black)] shadow-[0_0_24px_rgba(0,229,255,0.25)] transition-transform duration-150 ease-[var(--ease-expressive)] hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cyan)] disabled:cursor-not-allowed disabled:opacity-60 sm:px-4"
          >
            {creating ? (
              <Spinner />
            ) : (
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            )}
            {/* Label hides on mobile so the header fits (the + icon + aria-label carry it). */}
            <span className="hidden min-w-[7.5ch] text-center sm:inline-block">
              {creating ? 'Creating…' : 'New computer'}
            </span>
          </button>

          <button
            type="button"
            onClick={onSignOut}
            aria-label="Sign out"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-sm font-600 text-[var(--color-muted)] transition-colors duration-150 ease-[var(--ease-standard)] hover:border-[var(--color-cyan)] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cyan)]"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            {/* Label hides on mobile; the icon + aria-label carry it. */}
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {/* Error banner (quiet, dismissible by the next successful poll). */}
      {error && (
        <div
          role="alert"
          className="border-b border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-6 py-2.5 text-sm text-[var(--color-danger)]"
        >
          {error}
        </div>
      )}

      {/* Grid / empty-state */}
      <main className="flex-1 overflow-y-auto p-6 sm:p-10">
        {loading ? (
          <LoadingGrid />
        ) : isEmpty ? (
          <EmptyLaunchpad creating={creating} onCreate={() => void createComputer()} />
        ) : (
          <ul className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {desktops.map((desktop) => (
              <DesktopTile
                key={desktop.id}
                desktop={desktop}
                onOpen={() => onOpen(desktop, ticketsRef.current.get(desktop.id))}
                onStop={() => void stopComputer(desktop.id)}
                onDelete={() => setPendingDelete(desktop.id)}
                onConfirmDelete={() => void deleteComputer(desktop.id)}
                onCancelDelete={() => setPendingDelete(null)}
                confirming={pendingDelete === desktop.id}
                onRename={(name) => void renameComputer(desktop.id, name)}
                editing={renaming === desktop.id}
                onEditStart={() => setRenaming(desktop.id)}
                onEditCancel={() => setRenaming(null)}
              />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

/** Statuses where a container is actually running → accruing cost. */
const RUNNING_STATUSES: ReadonlySet<DesktopStatus> = new Set<DesktopStatus>(['ready', 'active']);

/**
 * Global financial bar (spec §39) — the always-visible answer to "what is costing money right now?".
 * Computed from the already-polled desktop list: running count, estimated hourly burn, and estimated
 * session spend. Every figure is an ESTIMATE from Cloudflare's published rate card
 * (`estimateDesktopCost`) × each running computer's uptime — NOT a finalized invoice (the metered
 * ledger is M3). Wallet balance arrives with Stripe (M3); until then this shows the honest live
 * burn, never a fabricated balance. Hidden when the user has no computers.
 */
function FinancialBar({ desktops }: { desktops: DesktopResource[] }) {
  if (desktops.length === 0) return null;
  const running = desktops.filter((d) => RUNNING_STATUSES.has(d.status));
  const now = Date.now();
  let burn = 0;
  let burnMax = 0;
  let sessionEst = 0;
  for (const d of running) {
    const { baselineUsdPerHour, maxUsdPerHour } = estimateDesktopCost(d.size);
    burn += baselineUsdPerHour;
    burnMax += maxUsdPerHour;
    sessionEst += baselineUsdPerHour * Math.max(0, (now - new Date(d.createdAt).getTime()) / 3_600_000);
  }
  const live = running.length > 0;
  const title =
    `Estimated from Cloudflare's rate card (memory + disk baseline; active CPU adds up to ~$${burnMax.toFixed(2)}/hr). ` +
    `An estimate, not a finalized bill — metered billing + wallet arrive with Stripe.`;
  return (
    <div
      data-testid={desktopTestIds.financialBar}
      title={title}
      className="hidden items-center gap-2.5 rounded-full border border-[var(--color-border)] bg-[var(--color-black)]/40 px-3 py-1.5 font-mono text-xs text-[var(--color-muted)] sm:inline-flex"
    >
      <span data-testid={desktopTestIds.financialBarRunning} className="flex items-center gap-1.5">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{
            backgroundColor: live ? 'var(--color-success)' : 'var(--color-muted)',
            boxShadow: live ? '0 0 8px var(--color-success)' : undefined,
          }}
          aria-hidden="true"
        />
        {`${running.length} running`}
      </span>
      <span className="h-3 w-px bg-[var(--color-border)]" aria-hidden="true" />
      <span className="text-[var(--color-white)]">{`~$${burn.toFixed(2)}/hr`}</span>
      <span className="h-3 w-px bg-[var(--color-border)]" aria-hidden="true" />
      <span title="estimated spend this session">{`~$${sessionEst.toFixed(2)} est`}</span>
    </div>
  );
}

/** A small inline spinner (respects reduced-motion via the global CSS gate). */
function Spinner() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden="true"
    />
  );
}

/** Skeleton tiles shown during the first list fetch. */
function LoadingGrid() {
  return (
    <ul
      className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
      aria-label="Loading your computers"
    >
      {Array.from({ length: 3 }).map((_, i) => (
        <li
          key={i}
          className="ds-glass flex h-44 animate-pulse flex-col justify-end rounded-xl p-5"
        >
          <div className="h-2.5 w-24 rounded-full bg-[var(--color-border)]" />
          <div className="mt-2 h-2 w-16 rounded-full bg-[var(--color-border)]/60" />
        </li>
      ))}
    </ul>
  );
}

/** Empty state = a launchpad pointing straight at the New-computer button. */
function EmptyLaunchpad({ creating, onCreate }: { creating: boolean; onCreate: () => void }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center justify-center py-20 text-center">
      <div
        className="mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-[var(--color-cyan)]/20 to-[var(--color-violet)]/20 ring-1 ring-[var(--color-cyan)]/30"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          width="28"
          height="28"
          fill="none"
          stroke="var(--color-cyan)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="4" width="20" height="13" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      </div>
      <h2 className="font-display text-2xl font-700 text-white">No computers yet</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-[var(--color-muted)]">
        Spin up your first cloud workstation. It boots in seconds, persists between sessions, and
        you can hand it to your AI agents.
      </p>
      <button
        type="button"
        onClick={onCreate}
        disabled={creating}
        className="mt-7 inline-flex items-center gap-2 rounded-lg bg-[var(--color-cyan)] px-5 py-3 text-sm font-700 text-[var(--color-black)] shadow-[0_0_24px_rgba(0,229,255,0.25)] transition-transform duration-150 ease-[var(--ease-expressive)] hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cyan)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {creating ? (
          <Spinner />
        ) : (
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        )}
        <span className="min-w-[10ch] text-center">{creating ? 'Creating…' : 'New computer'}</span>
      </button>
    </div>
  );
}

interface DesktopTileProps {
  desktop: DesktopResource;
  onOpen: () => void;
  onStop: () => void;
  onDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  confirming: boolean;
  /** Commit a new name (empty / unchanged is a no-op upstream). */
  onRename: (name: string) => void;
  /** Whether this tile's name is in inline-edit mode. */
  editing: boolean;
  onEditStart: () => void;
  onEditCancel: () => void;
}

/** One desktop tile — name/os/size/status + per-tile actions. */
function DesktopTile({
  desktop,
  onOpen,
  onStop,
  onDelete,
  onConfirmDelete,
  onCancelDelete,
  confirming,
  onRename,
  editing,
  onEditStart,
  onEditCancel,
}: DesktopTileProps) {
  // `desktop.size` is a DesktopSizeId so the lookup is always present; the
  // `?? everyday` keeps TS happy under noUncheckedIndexedAccess.
  const size = DESKTOP_SIZES[desktop.size] ?? DESKTOP_SIZES.everyday;
  // Inline-rename cancel flag: Enter / click-away commit via onBlur; Escape sets this so the same
  // onBlur cancels instead. One blur path → exactly one of commit/cancel fires per edit session.
  const renameCancelledRef = useRef(false);
  const { color, label, live } = statusPresentation(desktop.status);
  const openable = desktop.status === 'ready' || desktop.status === 'active';
  const stoppable = live || desktop.status === 'starting' || desktop.status === 'restoring';

  return (
    <li
      data-testid={desktopTestIds.tile}
      data-desktop-id={desktop.id}
      data-distro={desktop.distro}
      className="ds-glass group flex flex-col justify-between rounded-xl p-5 transition-transform duration-200 ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:border-[var(--color-cyan)]/40"
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <DistroLogo distro={desktop.distro} size={28} />
            {editing ? (
              <input
                data-testid={desktopTestIds.renameInput}
                defaultValue={desktop.name}
                autoFocus
                maxLength={60}
                aria-label={`Rename ${desktop.name}`}
                onFocus={(e) => {
                  renameCancelledRef.current = false;
                  e.currentTarget.select();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.currentTarget.blur(); // commit via onBlur
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    renameCancelledRef.current = true;
                    e.currentTarget.blur(); // cancel via onBlur
                  }
                }}
                onBlur={(e) => {
                  if (renameCancelledRef.current) {
                    renameCancelledRef.current = false;
                    onEditCancel();
                  } else {
                    onRename(e.currentTarget.value);
                  }
                }}
                className="min-w-0 flex-1 rounded-md border border-[var(--color-cyan)]/50 bg-[var(--color-black)]/60 px-2 py-0.5 font-display text-base font-700 text-white outline-none focus-visible:border-[var(--color-cyan)]"
              />
            ) : (
              <>
                <h3
                  className="truncate font-display text-base font-700 text-white"
                  title={desktop.name}
                >
                  {desktop.name}
                </h3>
                <button
                  type="button"
                  data-testid={desktopTestIds.renameButton}
                  onClick={onEditStart}
                  aria-label={`Rename ${desktop.name}`}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[var(--color-muted)] opacity-0 transition-opacity hover:text-[var(--color-cyan)] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-cyan)] group-hover:opacity-100"
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
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
              </>
            )}
          </div>
          <span
            data-testid={desktopTestIds.tileStatus}
            data-status={desktop.status}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--color-border)] px-2.5 py-1 text-xs font-600 text-[var(--color-muted)]"
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor: color,
                boxShadow: live ? `0 0 8px ${color}` : undefined,
              }}
              aria-hidden="true"
            />
            {label}
          </span>
        </div>

        <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-muted)]">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Operating system</dt>
            <dd>{desktop.os}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Type</dt>
            <dd className={desktop.form === 'server' ? 'text-[var(--color-cyan)]/80' : undefined}>
              {desktop.form === 'server' ? 'Server' : 'Desktop'}
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Size</dt>
            <dd className="font-mono">
              {size.friendlyName} · {size.ramGiB} GiB
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Estimated cost</dt>
            <dd
              className="font-mono"
              title="Estimated infrastructure cost while running (Cloudflare rate card; active CPU extra)"
            >
              {`~$${estimateDesktopCost(desktop.size).baselineUsdPerHour.toFixed(2)}/hr`}
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Created</dt>
            <dd title={new Date(desktop.createdAt).toLocaleString()}>
              Created {relativeTime(desktop.createdAt)}
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Persistence</dt>
            <dd
              className={
                desktop.persistent ? 'text-[var(--color-cyan)]/80' : 'text-[var(--color-muted)]'
              }
            >
              {desktop.persistent ? 'Persistent' : 'Disposable'}
            </dd>
          </div>
        </dl>
      </div>

      {/* Actions */}
      <div className="mt-5 flex items-center gap-2">
        {confirming ? (
          <>
            <button
              type="button"
              data-testid={desktopTestIds.deleteConfirm}
              onClick={onConfirmDelete}
              aria-label={`Confirm delete ${desktop.name}`}
              className="flex-1 rounded-lg bg-[var(--color-danger)] px-3 py-2 text-xs font-700 text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-danger)]"
            >
              Confirm delete
            </button>
            <button
              type="button"
              onClick={onCancelDelete}
              aria-label="Cancel delete"
              className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-600 text-[var(--color-muted)] transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cyan)]"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              data-testid={desktopTestIds.openButton}
              onClick={onOpen}
              disabled={!openable}
              aria-label={`Open ${desktop.name}`}
              className="flex-1 rounded-lg bg-[var(--color-cyan)]/15 px-3 py-2 text-xs font-700 text-[var(--color-cyan)] ring-1 ring-inset ring-[var(--color-cyan)]/30 transition-colors hover:bg-[var(--color-cyan)]/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cyan)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Open
            </button>
            <button
              type="button"
              data-testid={desktopTestIds.stopButton}
              onClick={onStop}
              disabled={!stoppable}
              aria-label={`Stop ${desktop.name}`}
              className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-600 text-[var(--color-muted)] transition-colors hover:border-[var(--color-warning)]/60 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cyan)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Stop
            </button>
            <button
              type="button"
              data-testid={desktopTestIds.deleteButton}
              onClick={onDelete}
              aria-label={`Delete ${desktop.name}`}
              className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] transition-colors hover:border-[var(--color-danger)]/60 hover:text-[var(--color-danger)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-danger)]"
            >
              <svg
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
              </svg>
            </button>
          </>
        )}
      </div>
    </li>
  );
}

export default DesktopManager;
