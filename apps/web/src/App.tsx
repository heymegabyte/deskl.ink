import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { HomeOverlay } from './components/HomeOverlay.js';
import { DesktopManager } from './components/DesktopManager.js';
import type { DesktopResource } from '../../../packages/shared/src/desktop-api';

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

/** Reads the dismissed flag safely (SSR/sandboxed storage guarded). */
function readDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(OVERLAY_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/** A desktop opened into the fullscreen view, plus its freshest VNC ticket. */
interface OpenTarget {
  desktop: DesktopResource;
  ticket?: string | undefined;
}

/** Root orchestration: homepage overlay → desktop manager → fullscreen VNC. */
export function App() {
  const [dismissed, setDismissed] = useState<boolean>(readDismissed);
  const [openTarget, setOpenTarget] = useState<OpenTarget | null>(null);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(OVERLAY_DISMISSED_KEY, '1');
    } catch {
      // Storage unavailable (private mode / sandbox) — overlay still dismisses.
    }
  }, []);

  // Sign out: clear the dismiss flag, drop any open desktop, reopen the overlay.
  const reopenOverlay = useCallback(() => {
    setOpenTarget(null);
    setDismissed(false);
    try {
      window.sessionStorage.removeItem(OVERLAY_DISMISSED_KEY);
    } catch {
      // Storage unavailable — state reset still reopens the overlay.
    }
  }, []);

  const openDesktop = useCallback((desktop: DesktopResource, ticket?: string) => {
    setOpenTarget({ desktop, ticket });
  }, []);

  const closeFullscreen = useCallback(() => setOpenTarget(null), []);

  // Lock background scroll while the overlay is up.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = dismissed ? prev : 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [dismissed]);

  return (
    <div className="relative h-full">
      {/* The authenticated app surface. Rendered behind the overlay so dismissing
          reveals a live manager; inert while the overlay is up for a11y. */}
      <div className="h-full" aria-hidden={!dismissed} {...(!dismissed ? { inert: true } : {})}>
        <DesktopManager onOpen={openDesktop} onSignOut={reopenOverlay} />
      </div>

      {!dismissed && <HomeOverlay onDismiss={dismiss} />}

      {/* Fullscreen VNC view for the opened desktop (lazy chunk). */}
      {openTarget && (
        <Suspense fallback={<FullscreenBoot />}>
          <DesktopFullscreen
            desktop={openTarget.desktop}
            ticket={openTarget.ticket}
            onExit={closeFullscreen}
          />
        </Suspense>
      )}
    </div>
  );
}

/** Minimal boot screen while the fullscreen chunk loads (no WebGL dep). */
function FullscreenBoot() {
  return (
    <div className="ds-nebula-fallback fixed inset-0 z-[60] flex items-center justify-center">
      <span
        className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-cyan)] border-t-transparent"
        aria-hidden="true"
      />
      <span className="sr-only">Loading desktop…</span>
    </div>
  );
}

export default App;
