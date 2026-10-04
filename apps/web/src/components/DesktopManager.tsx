import { useCallback, useEffect, useRef, useState } from 'react';
import {
  desktopTestIds,
  DESKTOP_SIZES,
  type DesktopResource,
  type DesktopStatus,
} from '../../../../packages/shared/src/desktop-api';
import { api, ApiError } from '../lib/api.js';

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
  /** Open a desktop in the fullscreen VNC view. `ticket` is the freshest known. */
  onOpen: (desktop: DesktopResource, ticket?: string) => void;
  /** Sign out / return to the homepage overlay. */
  onSignOut: () => void;
}

export function DesktopManager({ onOpen, onSignOut }: DesktopManagerProps) {
  const [desktops, setDesktops] = useState<DesktopResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  // Freshest VNC ticket per desktop, captured at create time. Opening a tile
  // forwards it so the fullscreen view can connect without re-minting.
  const ticketsRef = useRef<Map<string, string>>(new Map());

  /** Pull the full desktop list and reconcile into state. */
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const { desktops: next } = await api.listDesktops(signal);
      if (signal?.aborted) return;
      setDesktops(next);
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
  const createComputer = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const { desktop, vncTicket } = await api.createDesktop({
        size: 'everyday',
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
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create a computer.');
    } finally {
      setCreating(false);
    }
  }, [creating]);

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
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not stop the computer.');
        void refresh();
      }
    },
    [refresh]
  );

  /** Delete a desktop after confirmation; remove its tile optimistically. */
  const deleteComputer = useCallback(
    async (id: string) => {
      setPendingDelete(null);
      const prevList = desktops;
      setDesktops((prev) => prev.filter((d) => d.id !== id));
      ticketsRef.current.delete(id);
      try {
        await api.deleteDesktop(id);
      } catch (err) {
        // Roll back the optimistic removal on failure.
        setError(err instanceof ApiError ? err.message : 'Could not delete the computer.');
        setDesktops(prevList);
      }
    },
    [desktops]
  );

  const isEmpty = !loading && desktops.length === 0;

  return (
    <div className="ds-nebula-fallback flex h-full flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-[var(--color-cyan)] to-[var(--color-violet)] font-display text-sm font-800 text-[var(--color-black)]">
            d
          </span>
          <span className="font-display text-lg font-700 tracking-tight text-white">deskl.ink</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            data-testid={desktopTestIds.newComputerButton}
            onClick={() => void createComputer()}
            disabled={creating}
            aria-label="Create a new computer"
            aria-busy={creating}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-cyan)] px-4 py-2.5 text-sm font-700 text-[var(--color-black)] shadow-[0_0_24px_rgba(0,229,255,0.25)] transition-transform duration-150 ease-[var(--ease-expressive)] hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cyan)] disabled:cursor-not-allowed disabled:opacity-60"
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
            <span className="min-w-[7.5ch] text-center">
              {creating ? 'Creating…' : 'New computer'}
            </span>
          </button>

          <button
            type="button"
            onClick={onSignOut}
            aria-label="Sign out"
            className="rounded-lg border border-[var(--color-border)] px-3 py-2.5 text-sm font-600 text-[var(--color-muted)] transition-colors duration-150 ease-[var(--ease-standard)] hover:border-[var(--color-cyan)] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cyan)]"
          >
            Sign out
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
              />
            ))}
          </ul>
        )}
      </main>
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
        aria-label="Create your first computer"
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
}: DesktopTileProps) {
  // `desktop.size` is a DesktopSizeId so the lookup is always present; the
  // `?? everyday` keeps TS happy under noUncheckedIndexedAccess.
  const size = DESKTOP_SIZES[desktop.size] ?? DESKTOP_SIZES.everyday;
  const { color, label, live } = statusPresentation(desktop.status);
  const openable = desktop.status === 'ready' || desktop.status === 'active';
  const stoppable = live || desktop.status === 'starting' || desktop.status === 'restoring';

  return (
    <li
      data-testid={desktopTestIds.tile}
      data-desktop-id={desktop.id}
      className="ds-glass group flex flex-col justify-between rounded-xl p-5 transition-transform duration-200 ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:border-[var(--color-cyan)]/40"
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <h3 className="truncate font-display text-base font-700 text-white" title={desktop.name}>
            {desktop.name}
          </h3>
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
            <dt className="sr-only">Size</dt>
            <dd className="font-mono">
              {size.friendlyName} · {size.ramGiB} GiB
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
