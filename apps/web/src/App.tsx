import { useCallback, useEffect, useState } from 'react';
import { HomeOverlay } from './components/HomeOverlay.js';

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

/**
 * The locked, read-only app shell rendered BEHIND the overlay. It's a preview
 * of the real workspace (top bar + empty desktop grid). Non-interactive until
 * the user signs in — Milestone 2 replaces this with the live desktop grid.
 */
function AppShellPreview() {
  return (
    <div className="ds-nebula-fallback flex h-full flex-col" aria-hidden="true" inert>
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-[var(--color-cyan)] to-[var(--color-violet)] font-display text-sm font-800 text-[var(--color-black)]">
            d
          </span>
          <span className="font-display text-lg font-700 tracking-tight text-white">deskl.ink</span>
        </div>
        <nav className="flex items-center gap-6 text-sm text-[var(--color-muted)]">
          <span>Desktops</span>
          <span>Activity</span>
          <span>Billing</span>
        </nav>
      </header>

      {/* Empty desktop grid placeholder */}
      <main className="flex flex-1 items-center justify-center p-10">
        <div className="grid w-full max-w-5xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="ds-glass flex h-40 flex-col justify-end rounded-xl p-5">
              <div className="h-2.5 w-24 rounded-full bg-[var(--color-border)]" />
              <div className="mt-2 h-2 w-16 rounded-full bg-[var(--color-border)]/60" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

/** Root orchestration: overlay over a locked app shell. */
export function App() {
  const [dismissed, setDismissed] = useState<boolean>(readDismissed);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(OVERLAY_DISMISSED_KEY, '1');
    } catch {
      // Storage unavailable (private mode / sandbox) — overlay still dismisses.
    }
  }, []);

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
      <AppShellPreview />
      {!dismissed && <HomeOverlay onDismiss={dismiss} />}
    </div>
  );
}

export default App;
