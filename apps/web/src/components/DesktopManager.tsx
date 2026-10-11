import { useCallback, useEffect, useId, useRef, useState } from 'react';
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
import { api, ApiError, type SessionState } from '../lib/api.js';
import { useFocusTrap } from '../lib/useFocusTrap.js';
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

/** How long the success toast stays visible before it auto-dismisses (ms). */
const TOAST_MS = 3000;

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
  /** The signed-in identity (from App's session fetch) — shown in the header account menu. */
  user?: SessionState['user'];
}

export function DesktopManager({
  onOpen,
  onSignOut,
  onDeleted,
  openPickerSignal,
  user,
}: DesktopManagerProps) {
  const [desktops, setDesktops] = useState<DesktopResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [confirmStopAll, setConfirmStopAll] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  // Ids whose on-demand `/home` → R2 snapshot is in flight. A Set (not a single id) so backups on
  // several computers can run at once without one tile's busy state stomping another's. Drives the
  // per-tile "Back up now" affordance's disabled + "Backing up…" state.
  const [backingUp, setBackingUp] = useState<ReadonlySet<string>>(new Set());
  // Polite announcements for successful lifecycle actions (WCAG 4.1.3 Status Messages). This string
  // feeds the ONE shared live region — which is ALSO the visible success toast below, so sighted and
  // screen-reader users share a single source of truth (no double-announce). Errors are surfaced
  // separately via the role="alert" error banner.
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

  // Drives the visible toast's enter/exit: `true` just after a new announcement lands, flipped back
  // to `false` ~TOAST_MS later so the toast fades out. The toast element stays mounted (it IS the
  // persistent live region), so screen readers still read the latest message even once it's hidden.
  const [toastShown, setToastShown] = useState(false);

  // The command palette (via App) requests the New-computer picker by bumping this signal.
  useEffect(() => {
    if (openPickerSignal) setPickerOpen(true);
  }, [openPickerSignal]);

  // Show-then-auto-dismiss the success toast whenever a new announcement arrives. The timer is
  // cleared on the next message (so rapid actions re-arm a fresh 3s window, not a stale one) and on
  // unmount. Reduced-motion users get the same lifecycle — only the fade transition is suppressed
  // (via `motion-reduce:` + the global reduced-motion CSS gate).
  useEffect(() => {
    if (!announcement) return;
    setToastShown(true);
    const timer = setTimeout(() => setToastShown(false), TOAST_MS);
    return () => clearTimeout(timer);
  }, [announcement]);

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

  /**
   * Restart a running desktop: checkpoint `/home`, then stop→start (the backend drives it
   * persisting→starting→ready before responding). Optimistically show `persisting` ("saving your
   * work"); the settling poll then tracks starting→ready. Reconcile from the response; revert on
   * failure. The success toast fires the instant the restart is requested (the request itself is
   * long-running — a real checkpoint + boot — so announcing on request, not on resolve, keeps the
   * UI responsive; the returned `ready` desktop reconciles the tile).
   */
  const restartComputer = useCallback(
    async (id: string) => {
      const current = desktops.find((d) => d.id === id);
      const name = current?.name ?? 'Computer';
      setDesktops((prev) => prev.map((d) => (d.id === id ? { ...d, status: 'persisting' } : d)));
      setAnnouncement(`${name} restarting.`);
      try {
        const fresh = await api.restartDesktop(id);
        setDesktops((prev) => prev.map((d) => (d.id === fresh.id ? fresh : d)));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not restart the computer.');
        // Revert the optimistic status (or reconcile from the server if we never had it).
        if (current) {
          setDesktops((prev) => prev.map((d) => (d.id === id ? current : d)));
        } else {
          void refresh();
        }
      }
    },
    [desktops, refresh]
  );

  /**
   * Back up a running computer's `/home` to durable R2 storage ON DEMAND — surfacing the proven
   * persistence capability as a first-class user action (not only the implicit stop/restart/delete
   * checkpoints). Honest end-to-end: branch on the TYPED {@link SnapshotResult}, never a faked
   * success.
   *   - `ok: true`                    → success toast via the shared announcer.
   *   - `ok: false, capability_gap`   → the backup agent is unreachable (e.g. the computer isn't
   *                                     actually running). NEUTRAL toast — it's a state, not a hard
   *                                     error — so we announce (not `setError`) the honest reason.
   *   - `ok: false, error`            → a real failure of a configured capability → the error banner.
   * The busy state is always cleared in `finally` (so a thrown ApiError can't wedge the button).
   */
  const snapshotComputer = useCallback(
    async (id: string) => {
      const name = desktops.find((d) => d.id === id)?.name ?? 'Computer';
      setBackingUp((prev) => new Set(prev).add(id));
      try {
        const result = await api.snapshotDesktop(id);
        if (result.ok) {
          // Optimistically stamp the tile's "Backed up <time>" indicator with the manifest's time so
          // it appears immediately — the list poll reconciles the persisted server value afterward.
          setDesktops((prev) =>
            prev.map((d) => (d.id === id ? { ...d, lastBackupAt: result.manifest.createdAt } : d))
          );
          setAnnouncement(`Backed up ${name}.`);
        } else if (result.kind === 'capability_gap') {
          // Not an error — the computer must be running for its backup agent to answer.
          setAnnouncement(`${name} must be running to back up.`);
        } else {
          setError(`Backup failed: ${result.reason}`);
        }
      } catch (err) {
        // A genuine network/parse fault (the route itself never 5xxs) — surface it like any other.
        setError(err instanceof ApiError ? err.message : `Could not back up ${name}.`);
      } finally {
        setBackingUp((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [desktops]
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
  // Resolve the delete dialog's target from the live list by its id. If the id ever vanishes from the
  // list (e.g. a poll reconciled it away while the dialog was open) this is `undefined` and the modal
  // unmounts — never a dialog pointing at a computer that no longer exists.
  const pendingDeleteTarget = pendingDelete
    ? desktops.find((d) => d.id === pendingDelete)
    : undefined;

  return (
    <div className="ds-nebula-fallback flex h-full flex-col">
      {/* Page heading for assistive tech (the visible brand is the Wordmark logo). */}
      <h1 className="sr-only">Your computers</h1>
      {/*
        Success toast — created/stopped/deleted/renamed outcomes (WCAG 4.1.3 Status Messages). This is
        ONE element serving BOTH audiences: it is the polite live region screen readers announce AND
        the visible on-brand toast sighted users see — so there is exactly one announcement, never a
        double. ZERO LAYOUT SHIFT: `fixed bottom-4 right-4` takes it out of flow entirely, so it can
        never reflow the grid or header no matter how long the message is. It stays mounted (empty
        string → nothing to read) so the live region is stable; `toastShown` only toggles its
        visibility. `pointer-events-none` keeps it from ever blocking a click underneath.
      */}
      <div
        data-testid={desktopTestIds.statusAnnouncer}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] justify-end sm:max-w-sm"
      >
        {announcement && (
          <div
            className={`ds-glass flex items-center gap-2.5 rounded-xl border border-[var(--color-cyan)]/30 px-4 py-2.5 text-sm font-600 text-white shadow-[0_8px_30px_rgba(0,0,0,0.5),0_0_20px_rgba(0,229,255,0.12)] transition-[opacity,transform] duration-300 ease-[var(--ease-expressive)] motion-reduce:transition-none ${
              toastShown ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
            }`}
          >
            {/* Cyan check glyph in a soft halo — the on-brand "success" cue. */}
            <span
              className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--color-cyan)]/15 text-[var(--color-cyan)] ring-1 ring-inset ring-[var(--color-cyan)]/40"
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>
            {announcement}
          </div>
        )}
      </div>
      {pickerOpen && (
        <OsPicker
          onCreate={(distro, size, form) => void createComputer(distro, size, form)}
          onClose={() => setPickerOpen(false)}
          creating={creating}
        />
      )}
      {/*
        Destructive-confirmation dialog — rendered ONCE here at the manager level, OUTSIDE every tile.
        A tile carries a `hover:-translate-y-0.5` transform, and a transformed ancestor makes a
        `position:fixed` descendant resolve against THAT ancestor instead of the viewport — so a
        dialog rendered inside the (hovered) tile anchored to the tile, not the viewport. Hoisting it
        here (no transformed ancestor) restores a true viewport-centered fixed modal. `pendingDelete`
        holds the target id (set by a tile's trash button); we resolve the live {@link DesktopResource}
        from the already-polled `desktops` list so the dialog still shows that computer's identity
        facts. Mounted only while a target exists; Confirm → the unchanged `deleteComputer`, Cancel/Esc/
        click-outside → clear `pendingDelete`. Because it mounts the instant the trash button is
        clicked (that button is the live `document.activeElement`), useFocusTrap captures it and
        restores focus straight back to that trash button on close.
      */}
      {pendingDeleteTarget && (
        <DeleteDialog
          desktop={pendingDeleteTarget}
          size={DESKTOP_SIZES[pendingDeleteTarget.size] ?? DESKTOP_SIZES.everyday}
          onConfirm={() => void deleteComputer(pendingDeleteTarget.id)}
          onCancel={() => setPendingDelete(null)}
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

          {/* Account menu — the signed-in identity + Sign out, folded into one compact avatar button
              (replaces the bare header Sign-out to declutter and finally show WHO is signed in). */}
          <AccountMenu user={user} onSignOut={onSignOut} />
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
                onRestart={() => void restartComputer(desktop.id)}
                onBackup={() => void snapshotComputer(desktop.id)}
                backingUp={backingUp.has(desktop.id)}
                onDelete={() => setPendingDelete(desktop.id)}
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

/** Human label for each auth provider (the session's `provider` ∈ google|github|email|dev). */
const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  github: 'GitHub',
  email: 'Email',
  dev: 'Dev',
};

/**
 * Account menu (header) — a compact round avatar button (the email's first initial) that opens a
 * small on-brand glass popover showing WHO is signed in (email + provider) and the Sign-out action.
 * This replaces the old bare header "Sign out" button: the identity was previously invisible, and the
 * lone button cluttered a tight header — folding both into one avatar declutters AND answers "who am
 * I?". The Sign-out behavior is unchanged (same `onSignOut` handler, now a menu item).
 *
 * a11y — the ARIA menu-button pattern: the trigger is `aria-haspopup="menu"` + `aria-expanded`; on
 * open focus moves into the menu (useFocusTrap), Tab is contained, Escape closes AND returns focus to
 * the button (focus-trap restore), and a click outside closes it. Mobile-safe: the trigger is ONLY
 * the fixed-size avatar (no inline email text), so the header still fits at 375px.
 */
function AccountMenu({
  user,
  onSignOut,
}: {
  user?: SessionState['user'];
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  // Arm the focus trap only while open: moves focus into the menu on open, contains Tab, and restores
  // focus to the trigger on close (the exact "Esc returns focus to the button" behavior we want).
  useFocusTrap(menuRef, open);

  const email = user?.email ?? '';
  // First initial (uppercase) for the avatar; a neutral dot if the email is somehow absent.
  const initial = email.trim().charAt(0).toUpperCase() || '•';
  const providerLabel = user?.provider ? (PROVIDER_LABELS[user.provider] ?? user.provider) : null;

  // Click-outside closes (pointerdown so it fires before focus churn). Bound only while open.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setOpen(false);
    };
    // Escape closes here too (belt-and-suspenders with the focus trap's restore): keydown on the
    // document so it works wherever focus sits inside the menu.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        data-testid={desktopTestIds.accountMenuButton}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label="Account"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--color-cyan)]/40 bg-[var(--color-black)]/60 font-display text-sm font-700 text-[var(--color-cyan)] shadow-[0_0_14px_rgba(0,229,255,0.15)] transition-colors duration-150 ease-[var(--ease-standard)] hover:border-[var(--color-cyan)] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cyan)]"
      >
        <span aria-hidden="true">{initial}</span>
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Account"
          className="ds-glass absolute right-0 top-[calc(100%+0.5rem)] z-50 w-60 origin-top-right overflow-hidden rounded-xl border border-[var(--color-cyan)]/25 shadow-[0_12px_40px_rgba(0,0,0,0.55),0_0_28px_rgba(0,229,255,0.12)] [animation:ds-pop_140ms_var(--ease-expressive)]"
          style={{ animationName: 'ds-pop' }}
        >
          {/* Identity header — email (truncates if long) + provider label. */}
          <div className="border-b border-[var(--color-border)] px-3.5 py-3">
            <p className="truncate text-sm font-600 text-white" title={email || undefined}>
              {email || 'Signed in'}
            </p>
            {providerLabel && (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                <ProviderGlyph provider={user?.provider} />
                {providerLabel}
              </p>
            )}
          </div>

          {/* Sign out — the moved header action, now a menu item (same handler/behavior). */}
          <button
            type="button"
            role="menuitem"
            data-testid={desktopTestIds.accountSignOut}
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm font-600 text-[var(--color-muted)] transition-colors hover:bg-[var(--color-cyan)]/10 hover:text-white focus-visible:bg-[var(--color-cyan)]/10 focus-visible:text-white focus-visible:outline-none"
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
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/** Tiny per-provider glyph next to the provider label (aria-hidden; the label carries the name). */
function ProviderGlyph({ provider }: { provider?: string | undefined }) {
  const common = { width: 13, height: 13, 'aria-hidden': true as const };
  if (provider === 'google') {
    return (
      <svg viewBox="0 0 24 24" {...common}>
        <path fill="#4285F4" d="M23 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.2a5.3 5.3 0 0 1-2.3 3.48v2.9h3.72C21.78 18.9 23 15.9 23 12.27Z" />
        <path fill="#34A853" d="M12 23c3.1 0 5.7-1.03 7.62-2.79l-3.72-2.9c-1.03.7-2.35 1.1-3.9 1.1-3 0-5.54-2.02-6.45-4.74H1.7v2.98A11 11 0 0 0 12 23Z" />
        <path fill="#FBBC05" d="M5.55 13.67a6.6 6.6 0 0 1 0-4.22V6.47H1.7a11 11 0 0 0 0 9.86l3.85-2.66Z" />
        <path fill="#EA4335" d="M12 5.4c1.69 0 3.2.58 4.4 1.72l3.3-3.3C17.7 1.98 15.1 1 12 1A11 11 0 0 0 1.7 6.47l3.85 2.98C6.46 7.42 9 5.4 12 5.4Z" />
      </svg>
    );
  }
  if (provider === 'github') {
    return (
      <svg viewBox="0 0 24 24" {...common} fill="currentColor">
        <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48l-.01-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.26-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.39.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85l-.01 2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
      </svg>
    );
  }
  // email / dev (and any fallback) — a neutral mail glyph.
  return (
    <svg viewBox="0 0 24 24" {...common} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

/**
 * Shared type geometry for a tile's name in BOTH view (<h3>) and edit (<input>) modes. Applying the
 * SAME classes (font family + size + weight + line-height, via Tailwind `text-base`) to both — plus
 * the input's inline box reset (font/letter-spacing/line-height inherit, zero padding/border/margin)
 * — is what guarantees ZERO layout shift when swapping between the two.
 */
const NAME_TYPOGRAPHY = 'font-display text-base font-700 tracking-normal';

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
  onRestart: () => void;
  /** Snapshot `/home` to durable R2 on demand (the "Back up now" footer affordance). */
  onBackup: () => void;
  /** This computer's on-demand backup is in flight → the affordance is busy/disabled. */
  backingUp: boolean;
  /** Request deletion of this computer — sets the manager's `pendingDelete`, which opens the single
   *  manager-level confirmation dialog (hoisted out of the tile so its `fixed` modal centers in the
   *  viewport, not against the tile's hover transform). */
  onDelete: () => void;
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
  onRestart,
  onBackup,
  backingUp,
  onDelete,
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
  // Inline validation: true once the field is edited down to empty/whitespace (a no-op on commit).
  const [invalid, setInvalid] = useState(false);
  const renameHintId = useId();
  const { color, label, live } = statusPresentation(desktop.status);
  const openable = desktop.status === 'ready' || desktop.status === 'active';
  // A desktop is in a settling lifecycle state (persisting | stopping | starting | restoring) —
  // the SAME module-level set the poller uses, so "is it mid-operation?" has one definition.
  const isTransient = TRANSIENT_STATUSES.has(desktop.status);
  // Stop/Restart APPLY whenever the computer is running (live) OR already settling toward/away from
  // running. We keep them RENDERED through the whole transient window (`|| isTransient`) and only
  // DISABLE them there — so clicking Stop/Restart (which flips the tile to `persisting`/`stopping`)
  // can't unmount the controls mid-operation and reflow the action row. They still disappear at a
  // genuine terminal non-running state (`stopped` / `failed`), where neither verb applies.
  const stoppable = live || desktop.status === 'starting' || desktop.status === 'restoring';
  const showLifecycleControls = stoppable || isTransient;

  return (
    <li
      data-testid={desktopTestIds.tile}
      data-desktop-id={desktop.id}
      data-distro={desktop.distro}
      className="ds-glass group flex flex-col justify-between rounded-xl p-5 transition-transform duration-200 ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:border-[var(--color-cyan)]/40"
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          {/* `relative` anchors the inline validation hint; wrapper geometry is otherwise unchanged. */}
          <div className="relative flex min-w-0 items-center gap-2.5">
            <DistroLogo distro={desktop.distro} size={28} />
            {/* ZERO-SHIFT RENAME BY CONSTRUCTION: the <h3>'s OWN box + className are BYTE-IDENTICAL in
                view AND edit mode — it never toggles `truncate` (or anything geometry-affecting), so as
                a flex item in this `items-center` row its cross-axis position (top) can never recompute.
                It is ALWAYS mounted as the sole layout anchor + positioning context
                (`relative min-w-0 flex-1`). Entering edit mode changes ONLY two things, neither of which
                touches in-flow geometry: (1) the inner name <span> becomes `invisible` (keeps its box +
                accessible name — NOT `hidden`, which would collapse it); (2) an `absolute inset-0`
                <input> is added as the h3's child. An abs-positioned child takes its box from the h3's
                padding-box ≡ (h3 has zero padding) the h3's border-box, so the input inherits the h3's
                exact top/left/width/height. `truncate` lives on the SPAN (not the h3), so overflow
                clipping is confined to the span; the h3 itself has NO overflow:hidden, so it can never
                clip the abs-positioned input's box-shadow focus ring. */}
            <h3
              className={`${NAME_TYPOGRAPHY} relative min-w-0 flex-1 text-white`}
              title={desktop.name}
            >
              {/* The name TEXT. `truncate` (overflow-hidden + text-ellipsis + whitespace-nowrap) lives
                  HERE on the span — NOT the h3 — so truncation still works in view mode while the h3's
                  box stays identical across modes. While editing the span goes `invisible` (keeps its
                  box so the row geometry never moves) and the overlaid <input> renders as the h3's
                  child; the input is NOT hidden from assistive tech, so the rename field keeps its own
                  accessible name. The span's overflow:hidden clips only the span's own content — it
                  cannot clip the input, which is an abs-positioned descendant of the h3 (the span is not
                  its containing block), so the focus ring is never clipped. */}
              <span className={`block truncate ${editing ? 'invisible' : ''}`}>{desktop.name}</span>
              {editing && (
                <input
                  data-testid={desktopTestIds.renameInput}
                  defaultValue={desktop.name}
                  autoFocus
                  maxLength={60}
                  aria-label={`Rename ${desktop.name}`}
                  aria-invalid={invalid}
                  {...(invalid ? { 'aria-describedby': `${renameHintId}` } : {})}
                  onFocus={(e) => {
                    renameCancelledRef.current = false;
                    e.currentTarget.select();
                  }}
                  onChange={(e) => setInvalid(e.currentTarget.value.trim().length === 0)}
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
                  // Blur policy: SAVE-ON-BLUR-IF-CHANGED — committing on blur routes through
                  // renameComputer, which no-ops on empty/whitespace/unchanged (so click-away keeps
                  // a valid edit, discards a blank one); Escape sets the cancel flag so blur discards.
                  onBlur={(e) => {
                    if (renameCancelledRef.current) {
                      renameCancelledRef.current = false;
                      setInvalid(false);
                      onEditCancel();
                    } else {
                      onRename(e.currentTarget.value);
                    }
                  }}
                  // Overlaid `absolute inset-0` on the h3's OWN box (the input is the h3's child, and
                  // the h3 has zero padding) → identical top/left/width/height by construction. Shares
                  // NAME_TYPOGRAPHY (identical font/size/weight/tracking/leading) with the h3 — we do
                  // NOT override line-height (so the computed `line-height` stays pixel-equal to the
                  // h3's, which the spec asserts). `flex items-center` centers the input's single text
                  // line vertically in that exact box, landing on the h3's baseline (the h3 is
                  // single-line, so same box + same leading ⇒ same text position). Zero chrome (no
                  // border/padding/margin); the focus ring is a box-shadow — it never resizes the box.
                  // NB: NOT `font: inherit` — NAME_TYPOGRAPHY sets the font explicitly on both nodes;
                  // `inherit` would pull the body font and break the match. `whitespace-normal` just
                  // keeps the input rendering as a normal single-line field (the h3 no longer carries
                  // `truncate` — that lives on the sibling span — so there is nothing to undo here).
                  className={`${NAME_TYPOGRAPHY} absolute inset-0 flex w-full appearance-none items-center overflow-visible whitespace-normal rounded-[3px] border-0 bg-transparent p-0 text-left text-white caret-[var(--color-cyan)] outline-none ${
                    invalid
                      ? 'shadow-[0_0_0_2px_var(--color-danger)]'
                      : 'shadow-[0_0_0_2px_color-mix(in_oklab,var(--color-cyan)_70%,transparent)]'
                  }`}
                  style={{ margin: 0, boxSizing: 'border-box' }}
                />
              )}
            </h3>
            {editing && invalid && (
              // Absolutely positioned so the hint never reflows the tile (keeps zero-shift intact).
              <span
                id={renameHintId}
                role="alert"
                className="absolute left-0 top-full mt-1 text-xs text-[var(--color-danger)]"
              >
                Name can't be empty
              </span>
            )}
            {!editing && (
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
          {/* PERSISTED backup confirmation — "Backed up <relative>" — the lasting proof that the
              on-demand "Back up now" action (and every stop/restart checkpoint) durably captured
              /home to R2. Driven by the server's `lastBackupAt` (stamped on every successful
              snapshot/checkpoint) and set optimistically right after a "Back up now" so it appears
              instantly. Rendered ONLY when a backup has actually happened — when absent we show
              nothing (never a dead "never"/empty label). Small muted text, reading as part of the
              metadata row via a leading "·", sitting next to the "Back up now" affordance. */}
          {desktop.lastBackupAt && (
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Last backed up</dt>
              <dd
                className="flex items-center gap-1.5"
                title={new Date(desktop.lastBackupAt).toLocaleString()}
              >
                <span aria-hidden="true">·</span>
                Backed up {relativeTime(desktop.lastBackupAt)}
              </dd>
            </div>
          )}
          {/* "Back up now" — a SUBTLE TEXT affordance (deliberately NOT another icon in the crowded
              Open/Stop/Restart/trash row). It lives in the metadata footer, reading as part of the
              "~$x/hr · Created … · Persistent" row via a leading "·", so it never crowds the action
              buttons or threatens the mobile header/card layout (it's small text that wraps with the
              rest of the flex-wrap <dl>). Shown ONLY while the computer is running/ready (the SAME
              `stoppable` condition the lifecycle controls use) — a backup needs a live backup agent;
              the honest capability_gap toast covers the race where it stops between render and click.
              While its snapshot is in flight it goes disabled + "Backing up…". It surfaces the proven
              on-demand persistence capability (snapshot `/home` → durable R2). */}
          {stoppable && (
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Back up</dt>
              <dd className="flex items-center gap-1.5">
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  data-testid="desktop-backup"
                  onClick={onBackup}
                  disabled={backingUp}
                  aria-busy={backingUp}
                  aria-label={`Back up ${desktop.name} now`}
                  className="rounded-sm font-600 text-[var(--color-muted)] underline-offset-2 transition-colors hover:text-[var(--color-cyan)] hover:underline focus-visible:text-[var(--color-cyan)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cyan)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:no-underline"
                >
                  {backingUp ? 'Backing up…' : 'Back up now'}
                </button>
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* Actions — a stable single row (the trash opens a destructive-confirmation DIALOG, so the row
          never swaps into an inline confirm and never reflows). */}
      <div className="mt-5 flex items-center gap-2">
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
        {/* Stop + Restart stay MOUNTED through the whole running→settling window and only go
            DISABLED while transient (persisting | stopping | starting | restoring) — so clicking
            either (which optimistically flips the tile to persisting/stopping) can't unmount them
            mid-operation and reflow the row. The `disabled` affordance is dim + not-allowed ONLY;
            the button box (padding/border/size) is untouched, so geometry never shifts. They
            vanish together only at a terminal non-running state (stopped / failed). */}
        {showLifecycleControls && (
          <button
            type="button"
            data-testid={desktopTestIds.stopButton}
            onClick={onStop}
            disabled={isTransient}
            aria-disabled={isTransient}
            aria-busy={desktop.status === 'stopping' || desktop.status === 'persisting'}
            aria-label={`Stop ${desktop.name}`}
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-600 text-[var(--color-muted)] transition-colors hover:border-[var(--color-warning)]/60 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cyan)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Stop
          </button>
        )}
        {/* Restart — checkpoint + stop→start. Same mounted-through-transient / disabled-while-
            settling policy as Stop; compact icon-only so the action row never crowds. The
            circular-arrow glyph reads as "restart"; while settling the glyph spins (pure CSS,
            gated by the global reduced-motion rule) as a subtle "working" cue — the button box is
            unchanged so there's no geometry shift. */}
        {showLifecycleControls && (
          <button
            type="button"
            data-testid={desktopTestIds.restartButton}
            onClick={onRestart}
            disabled={isTransient}
            aria-disabled={isTransient}
            aria-label={`Restart ${desktop.name}`}
            title="Restart"
            className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] transition-colors hover:border-[var(--color-cyan)]/60 hover:text-[var(--color-cyan)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cyan)] disabled:cursor-not-allowed disabled:opacity-40"
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
              // While settling, the circular-arrow glyph spins as a subtle "working" cue. It's the
              // SAME 15×15 glyph in the SAME 8×8 button box (only the icon's own transform animates),
              // so the row geometry is identical to the idle state. `animate-spin` is suppressed by
              // the global reduced-motion gate (same as <Spinner/>), honoring prefers-reduced-motion.
              className={isTransient ? 'animate-spin [animation-duration:1.4s]' : undefined}
            >
              <path d="M3 2v6h6" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L3 8" />
            </svg>
          </button>
        )}
        {/* Trash — requests deletion by setting the manager's `pendingDelete`, which opens the ONE
            manager-level confirmation DIALOG (hoisted out of the tile so its `fixed` modal centers in
            the viewport, not against this tile's hover transform). Stays `desktop-delete` so existing
            E2E drives it unchanged; it's the focus-restore target when the dialog closes. */}
        <button
          type="button"
          data-testid={desktopTestIds.deleteButton}
          onClick={onDelete}
          aria-haspopup="dialog"
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
      </div>
    </li>
  );
}

/**
 * Destructive-confirmation dialog for deleting a computer (spec's P0 "attractive modal", replacing the
 * old two-step inline confirm). On-brand near-black glass, focus-trapped, ARIA dialog. It states
 * exactly WHAT is destroyed (the computer, its running state, every file in /home) and is HONEST about
 * recovery — restore-from-backup is NOT wired yet, so it never promises recoverability.
 *
 * Rendered ONCE at the manager level (NOT inside a tile): a tile carries a `hover:-translate-y-0.5`
 * transform, and a transformed ancestor re-anchors a `position:fixed` descendant to that ancestor
 * instead of the viewport — so a tile-nested dialog, opened while hovering the tile to reach its
 * trash button, anchored to the tile (visibly offset) rather than centering. At the manager level
 * there is no transformed ancestor, so `fixed inset-0 grid place-items-center` truly centers.
 *
 * Testids preserved so existing E2E runs UNCHANGED: the opener keeps `desktop-delete`; the danger
 * action here is `desktop-delete-confirm` and calls the SAME `deleteComputer` (via `onConfirm`). Only
 * one dialog ever exists at a time, so `desktop-delete-confirm` is page-unique.
 *
 * a11y — the ARIA dialog pattern mirrored from OsPicker: `role="dialog"` + `aria-modal="true"`,
 * labelled + described by its title/body; `useFocusTrap` moves focus in and restores it to the trash
 * trigger on close (it captures `document.activeElement` at mount, which is the just-clicked trash
 * button); Escape cancels; the `fixed inset-0` overlay button cancels on click-outside. `fixed`
 * positioning keeps the whole thing out of flow so the grid never reflows.
 */
function DeleteDialog({
  desktop,
  size,
  onConfirm,
  onCancel,
}: {
  desktop: DesktopResource;
  size: { friendlyName: string; ramGiB: number };
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);
  const titleId = useId();
  const descId = useId();

  // Escape cancels (belt-and-suspenders with the focus trap's focus-restore on unmount).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // The computer's identity, shown so the user confirms they're deleting the RIGHT machine.
  const facts: { label: string; value: string }[] = [
    { label: 'Operating system', value: desktop.os },
    { label: 'Size', value: `${size.friendlyName} · ${size.ramGiB} GiB` },
    { label: 'Type', value: desktop.form === 'server' ? 'Server' : 'Desktop' },
    { label: 'Persistence', value: desktop.persistent ? 'Persistent' : 'Disposable' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
    >
      {/* Dim + blur the manager behind; clicking it cancels (click-outside). */}
      <button
        type="button"
        aria-label="Cancel"
        onClick={onCancel}
        className="absolute inset-0 cursor-default bg-[var(--color-black)]/70 backdrop-blur-sm"
      />

      <div
        ref={dialogRef}
        className="ds-glass relative w-full max-w-md rounded-2xl border border-[var(--color-danger)]/30 p-7 shadow-[0_0_70px_rgba(255,92,108,0.12)] [animation:ds-pop_180ms_var(--ease-expressive)]"
        style={{ animationName: 'ds-pop' }}
      >
        {/* Danger glyph in a soft red halo — the on-brand destructive cue. */}
        <div
          className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-[var(--color-danger)]/12 text-[var(--color-danger)] ring-1 ring-inset ring-[var(--color-danger)]/30"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
          </svg>
        </div>

        <h2 id={titleId} className="font-display text-xl font-800 tracking-tight text-white">
          Delete {desktop.name}?
        </h2>

        <p id={descId} className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
          This removes the computer, its running state, and all files in its home directory. This
          permanently deletes the computer and cannot be undone.
        </p>

        {/* Identity — confirm you're destroying the RIGHT machine. */}
        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-black)]/40 p-4 text-sm">
          {facts.map((f) => (
            <div key={f.label} className="flex min-w-0 flex-col gap-0.5">
              <dt className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-[var(--color-muted)]">
                {f.label}
              </dt>
              <dd className="truncate font-600 text-white" title={f.value}>
                {f.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-7 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2.5 text-sm font-600 text-[var(--color-muted)] transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cyan)]"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid={desktopTestIds.deleteConfirm}
            onClick={onConfirm}
            aria-label={`Delete ${desktop.name}`}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-danger)] px-5 py-2.5 text-sm font-700 text-white shadow-[0_0_24px_rgba(255,92,108,0.28)] transition-transform duration-150 ease-[var(--ease-expressive)] hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-danger)]"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default DesktopManager;
