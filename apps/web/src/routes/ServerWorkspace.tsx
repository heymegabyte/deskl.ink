import { useCallback, useEffect, useState } from 'react';
import {
  desktopApi,
  desktopTestIds,
  type DesktopResource,
  type DesktopStatus,
} from '../../../../packages/shared/src/desktop-api';
import { api, ApiError } from '../lib/api.js';

/**
 * ServerWorkspace — a headless SERVER computer's tab (spec §9/§37). Unlike a desktop (remote GUI
 * over VNC), a server's primary work surface IS the terminal: a full-view ttyd iframe proxied under
 * /term/* with the same signed ticket. A thin top bar carries name + Stop + Exit; the terminal
 * fills the rest. (Files / Ports / OpenCode panels are additive follow-ups — kept out of the way so
 * the terminal stays dominant, per §37.)
 *
 * Deliberately separate from DesktopFullscreen so the monitor-critical desktop view is untouched.
 */
export function ServerWorkspace({
  desktop,
  ticket,
  onExit,
}: {
  desktop: DesktopResource;
  ticket?: string | undefined;
  onExit: () => void;
}) {
  const [current, setCurrent] = useState<DesktopResource>(desktop);
  const [termTicket, setTermTicket] = useState<string | undefined>(ticket);
  const [error, setError] = useState<string | null>(null);
  const [minting, setMinting] = useState(false);
  const [stopping, setStopping] = useState(false);

  const ready = current.status === 'ready' || current.status === 'active';

  // Guarantee a ticket (the mint endpoint also idempotently starts the container).
  const acquireTicket = useCallback(
    async (signal?: AbortSignal) => {
      setMinting(true);
      setError(null);
      try {
        const fresh = await api.mintTicket(current.id, signal);
        if (!signal?.aborted) {
          setTermTicket(fresh);
          setCurrent((d) =>
            d.status === 'ready' || d.status === 'active' ? d : { ...d, status: 'ready' }
          );
        }
      } catch (err) {
        if (!signal?.aborted) {
          setError(err instanceof ApiError ? err.message : 'Could not open a connection to this server.');
        }
      } finally {
        if (!signal?.aborted) setMinting(false);
      }
    },
    [current.id]
  );

  useEffect(() => {
    if (termTicket) return;
    const controller = new AbortController();
    void acquireTicket(controller.signal);
    return () => controller.abort();
  }, [termTicket, acquireTicket]);

  // Poll until ready while still settling.
  useEffect(() => {
    if (ready || current.status === 'failed' || current.status === 'stopped') return;
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

  // Esc exits to Home.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  const stop = useCallback(async () => {
    if (stopping) return;
    setStopping(true);
    try {
      await api.stopDesktop(current.id);
      onExit();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not stop this server.');
      setStopping(false);
    }
  }, [current.id, onExit, stopping]);

  const statusLabel: Record<DesktopStatus, string> = {
    stopped: 'Stopped',
    restoring: 'Restoring',
    starting: 'Starting',
    ready: 'Connected',
    active: 'Connected',
    stopping: 'Stopping',
    persisting: 'Saving',
    failed: 'Failed',
  };

  return (
    <div
      data-testid={desktopTestIds.serverWorkspace}
      className="fixed inset-x-0 bottom-0 top-9 z-[60] flex flex-col bg-[var(--color-black)]"
    >
      <h1 className="sr-only">{current.name} — server terminal</h1>
      {/* Thin server header: identity + session controls. Dominant surface stays the terminal. */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-1.5">
        <span className="flex min-w-0 items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-cyan)]">
          <svg
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="4" width="18" height="6" rx="1.5" />
            <rect x="3" y="14" width="18" height="6" rx="1.5" />
            <path d="M7 7h.01M7 17h.01" />
          </svg>
          <span className="truncate text-[var(--color-white)]">{current.name}</span>
          <span className="text-[var(--color-muted)]">· server</span>
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            data-testid={desktopTestIds.stopButton}
            onClick={() => void stop()}
            disabled={stopping}
            aria-label={`Stop ${current.name}`}
            className="grid h-7 w-7 place-items-center rounded-md text-[var(--color-muted)] transition-colors hover:bg-[var(--color-warning)]/15 hover:text-[var(--color-warning)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-cyan)] disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
          <button
            type="button"
            data-testid={desktopTestIds.exitFullscreen}
            onClick={onExit}
            aria-label="Back to Home"
            className="grid h-7 w-7 place-items-center rounded-md text-[var(--color-white)] transition-colors hover:bg-[var(--color-cyan)]/15 hover:text-[var(--color-cyan)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-cyan)]"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 9H4m0 0V4m0 5 6 6m5-11h5m0 0v5m0-5-6 6" />
            </svg>
          </button>
        </div>
      </div>

      {ready && termTicket ? (
        <iframe
          data-testid={desktopTestIds.serverTerminal}
          title={`${current.name} terminal`}
          src={desktopApi.termClient(current.id, termTicket)}
          className="h-full w-full flex-1 border-0 bg-[#05060A]"
          allow="clipboard-read; clipboard-write"
        />
      ) : (
        <div className="ds-nebula-fallback flex flex-1 flex-col items-center justify-center text-center">
          {!(current.status === 'failed' || error) && (
            <span
              className="mb-5 inline-block h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-cyan)] border-t-transparent"
              aria-hidden="true"
            />
          )}
          <p
            className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-cyan)]"
            aria-live="polite"
          >
            {current.status === 'failed' || error
              ? 'Connection failed'
              : `${minting ? 'Connecting' : statusLabel[current.status]}…`}
          </p>
          <p className="mt-2 text-sm text-[var(--color-muted)]">{error ?? current.name}</p>
          {(current.status === 'failed' || error) && (
            <button
              type="button"
              onClick={() => void acquireTicket()}
              className="mt-5 rounded-lg bg-[var(--color-cyan)] px-5 py-2.5 text-sm font-700 text-[var(--color-black)] shadow-[0_0_24px_rgba(0,229,255,0.25)] transition-transform duration-150 ease-[var(--ease-expressive)] hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-cyan)]"
            >
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default ServerWorkspace;
