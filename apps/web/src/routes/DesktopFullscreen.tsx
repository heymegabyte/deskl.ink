import { useCallback, useEffect, useRef, useState } from 'react';
import {
  desktopApi,
  desktopTestIds,
  type DesktopResource,
  type DesktopStatus,
} from '../../../../packages/shared/src/desktop-api';
import { api, ApiError } from '../lib/api.js';

/**
 * DesktopFullscreen — a near-full-viewport view that embeds the desktop's noVNC
 * client in an iframe filling the screen. A tiny translucent top-right control
 * surface (status dot · exit-fullscreen · stop) auto-hides on idle and reveals
 * on pointer move.
 *
 * Lazy-loaded (React.lazy) so the homepage WebGL never enters this chunk — this
 * module imports ONLY the shared contract + the fetch client, nothing visual
 * from the marketing overlay.
 */

/** Idle delay before the control surface fades out (ms). */
const IDLE_HIDE_MS = 2800;

interface DesktopFullscreenProps {
  desktop: DesktopResource;
  /** VNC ticket captured at create time; absent means we start/mint on mount. */
  ticket?: string | undefined;
  /** Leave fullscreen and return to the manager grid. */
  onExit: () => void;
}

function statusDot(status: DesktopStatus): { color: string; label: string; live: boolean } {
  switch (status) {
    case 'ready':
    case 'active':
      return { color: 'var(--color-success)', label: 'Connected', live: true };
    case 'starting':
      return { color: 'var(--color-warning)', label: 'Starting', live: false };
    case 'restoring':
      return { color: 'var(--color-warning)', label: 'Restoring', live: false };
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

export function DesktopFullscreen({ desktop, ticket, onExit }: DesktopFullscreenProps) {
  const [current, setCurrent] = useState<DesktopResource>(desktop);
  // The VNC ticket is minted at create time and passed in. If we arrived WITHOUT one
  // (page reload, reopening an already-running desktop), we mint a fresh ticket on demand
  // so the connect view can NEVER dead-end on a spinner — hence state, not a fixed prop.
  const [vncTicket, setVncTicket] = useState<string | undefined>(ticket);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minting, setMinting] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { color, label, live } = statusDot(current.status);
  const ready = current.status === 'ready' || current.status === 'active';

  // Auto-hide the control surface after idle; reveal on pointer/key activity.
  useEffect(() => {
    const reveal = () => {
      setControlsVisible(true);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => setControlsVisible(false), IDLE_HIDE_MS);
    };
    reveal();
    window.addEventListener('pointermove', reveal);
    window.addEventListener('keydown', reveal);
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      window.removeEventListener('pointermove', reveal);
      window.removeEventListener('keydown', reveal);
    };
  }, []);

  // Esc exits fullscreen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  // Guarantee we hold a VNC ticket. The mint endpoint also (idempotently) starts the
  // container, so this single call covers "no ticket", "reopened running desktop", AND
  // "stopped desktop" — previously a ready desktop with no ticket spun on "CONNECTED…"
  // forever with no recovery.
  const acquireTicket = useCallback(
    async (signal?: AbortSignal) => {
      setMinting(true);
      setError(null);
      try {
        const fresh = await api.mintTicket(current.id, signal);
        if (!signal?.aborted) {
          setVncTicket(fresh);
          setCurrent((d) =>
            d.status === 'ready' || d.status === 'active' ? d : { ...d, status: 'ready' },
          );
        }
      } catch (err) {
        if (!signal?.aborted) {
          setError(
            err instanceof ApiError ? err.message : 'Could not open a connection to this computer.',
          );
        }
      } finally {
        if (!signal?.aborted) setMinting(false);
      }
    },
    [current.id],
  );

  // On mount (and whenever we lack a ticket), mint one. Runs exactly once per missing
  // ticket: on success `vncTicket` is set so it won't re-fire; on failure it surfaces a
  // retry rather than looping.
  useEffect(() => {
    if (vncTicket) return;
    const controller = new AbortController();
    void acquireTicket(controller.signal);
    return () => controller.abort();
  }, [vncTicket, acquireTicket]);

  // Poll until ready while the desktop is still settling.
  useEffect(() => {
    if (ready) return;
    if (current.status === 'failed' || current.status === 'stopped') return;
    const controller = new AbortController();
    const timer = setInterval(() => {
      void api
        .getDesktop(current.id, controller.signal)
        .then((fresh) => {
          if (!controller.signal.aborted) setCurrent(fresh);
        })
        .catch(() => {
          /* transient */
        });
    }, 2000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [ready, current.id, current.status]);

  const stop = useCallback(async () => {
    if (stopping) return;
    setStopping(true);
    try {
      const fresh = await api.stopDesktop(current.id);
      setCurrent(fresh);
      onExit();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not stop this computer.');
      setStopping(false);
    }
  }, [current.id, onExit, stopping]);

  return (
    <div className="fixed inset-0 z-[60] bg-[var(--color-black)]">
      {/* The VNC surface fills the viewport. */}
      {ready && vncTicket ? (
        <iframe
          data-testid={desktopTestIds.vncViewport}
          title={`${current.name} remote desktop`}
          src={desktopApi.vncClient(current.id, vncTicket)}
          className="absolute inset-0 h-full w-full border-0"
          allow="clipboard-read; clipboard-write; fullscreen"
        />
      ) : (
        <ConnectingState
          name={current.name}
          // While minting a ticket the honest state is "connecting", not the desktop's
          // "Connected" status label (which would read as a misleading "CONNECTED…").
          label={minting ? 'Connecting' : label}
          failed={current.status === 'failed' || !!error}
          error={error}
          onRetry={() => void acquireTicket()}
        />
      )}

      {/* Error toast — only while the desktop IS mounted (e.g. a stop error); pre-connect
          errors are shown WITH a retry inside ConnectingState, so don't duplicate them. */}
      {error && ready && vncTicket && (
        <div
          role="alert"
          className="ds-glass absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-lg border-[var(--color-danger)]/40 px-4 py-2 text-sm text-[var(--color-danger)]"
        >
          {error}
        </div>
      )}

      {/* Tiny translucent control surface, top-right, auto-hiding. */}
      <div
        data-testid={desktopTestIds.controlSurface}
        role="toolbar"
        aria-label="Desktop controls"
        className="ds-glass absolute right-4 top-4 z-20 flex items-center gap-2 rounded-full px-2.5 py-1.5 transition-opacity duration-300 ease-[var(--ease-standard)]"
        style={{
          opacity: controlsVisible ? 1 : 0,
          // Keep the controls clickable even while faded — otherwise the full-screen VNC
          // iframe swallows clicks on the (idle-hidden) exit/stop buttons. Any pointer move
          // reveals them; the small top-right zone staying interactive is the correct tradeoff.
          pointerEvents: 'auto',
        }}
      >
        {/* Connection/status dot */}
        <span
          className="flex items-center gap-1.5 pl-1.5 pr-1 text-xs font-600 text-[var(--color-white)]"
          title={label}
        >
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: color, boxShadow: live ? `0 0 8px ${color}` : undefined }}
            aria-hidden="true"
          />
          <span className="sr-only">Status: </span>
          <span aria-live="polite">{label}</span>
        </span>

        <span className="h-4 w-px bg-[var(--color-border)]" aria-hidden="true" />

        {/* Stop */}
        <button
          type="button"
          data-testid={desktopTestIds.stopButton}
          onClick={() => void stop()}
          disabled={stopping}
          aria-label={`Stop ${current.name}`}
          aria-busy={stopping}
          className="grid h-8 w-8 place-items-center rounded-full text-[var(--color-muted)] transition-colors hover:bg-[var(--color-warning)]/15 hover:text-[var(--color-warning)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cyan)] disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        </button>

        {/* Exit fullscreen */}
        <button
          type="button"
          data-testid={desktopTestIds.exitFullscreen}
          onClick={onExit}
          aria-label="Exit fullscreen"
          className="grid h-8 w-8 place-items-center rounded-full text-[var(--color-white)] transition-colors hover:bg-[var(--color-cyan)]/15 hover:text-[var(--color-cyan)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cyan)]"
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
            <path d="M9 9H4m0 0V4m0 5 6 6m5-11h5m0 0v5m0-5-6 6m-5 5H4m0 0v-5m0 5 6-6m5 6h5m0 0v-5m0 5-6-6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/** Pre-connection placeholder: a quiet status while the desktop boots — or, on failure, a
 *  clear message + a Try-again button so the view is never a dead, unrecoverable spinner. */
function ConnectingState({
  name,
  label,
  failed,
  error,
  onRetry,
}: {
  name: string;
  label: string;
  failed: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  return (
    <div className="ds-nebula-fallback absolute inset-0 flex flex-col items-center justify-center text-center">
      {!failed && (
        <span
          className="mb-5 inline-block h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-cyan)] border-t-transparent"
          aria-hidden="true"
        />
      )}
      <p
        className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-cyan)]"
        aria-live="polite"
      >
        {failed ? 'Connection failed' : `${label}…`}
      </p>
      <p className="mt-2 text-sm text-[var(--color-muted)]">{error ?? name}</p>
      {failed && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 rounded-lg bg-[var(--color-cyan)] px-5 py-2.5 text-sm font-700 text-[var(--color-black)] shadow-[0_0_24px_rgba(0,229,255,0.25)] transition-transform duration-150 ease-[var(--ease-expressive)] hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cyan)]"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export default DesktopFullscreen;
