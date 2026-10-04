import { Suspense, lazy } from 'react';
import { DESKTOP_SIZES } from '@deskl/shared';
import { AuthPanel } from './AuthPanel.js';

// Lazy-load the WebGL/canvas hero so it stays out of the main bundle.
const HeroCanvas = lazy(() => import('./HeroCanvas.js'));

interface HomeOverlayProps {
  /** Dismiss the overlay (persisted by the parent for the session). */
  onDismiss: () => void;
}

/** A compact feature chip rendered in the left product column. */
function FeatureChip({ label }: { label: string }) {
  return (
    <li className="ds-glass rounded-full px-3.5 py-1.5 text-xs font-500 text-[var(--color-white)]">
      {label}
    </li>
  );
}

/**
 * HomeOverlay — full-screen layer above the locked app shell.
 * Left ~62%: the product experience (headline + supporting copy + size chips)
 * over the living nebula. Right ~38%: the auth panel. Elegant dismiss X top-right.
 * Collapses to a single column on mobile.
 */
export function HomeOverlay({ onDismiss }: HomeOverlayProps) {
  const sizes = Object.values(DESKTOP_SIZES);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to deskl.ink"
      className="ds-nebula-fallback fixed inset-0 z-50 overflow-y-auto"
    >
      {/* Living nebula behind everything; degrades to the gradient above. */}
      <Suspense fallback={null}>
        <HeroCanvas />
      </Suspense>

      {/* Dim scrim to keep foreground copy AA-legible over bright nebula. */}
      <div
        className="pointer-events-none absolute inset-0 bg-[var(--color-black)]/35"
        aria-hidden="true"
      />

      <button
        type="button"
        data-testid="overlay-close"
        onClick={onDismiss}
        aria-label="Close and preview the workspace"
        className="ds-glass absolute right-5 top-5 z-10 grid h-10 w-10 place-items-center rounded-full text-[var(--color-white)] transition-transform duration-150 ease-[var(--ease-expressive)] hover:scale-105"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      <div className="relative z-[1] mx-auto flex min-h-full w-full max-w-7xl flex-col gap-10 px-6 py-16 lg:flex-row lg:items-center lg:gap-14 lg:py-20">
        {/* Left: product experience (~62%). */}
        <section className="lg:basis-[62%]">
          <p className="mb-5 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-cyan)]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-cyan)] shadow-[0_0_12px_var(--color-cyan)]" />
            Cloudflare-native workstations
          </p>

          <h1 className="font-display text-[clamp(2.5rem,1.9rem+3vw,4.5rem)] font-800 leading-[1.05] tracking-tight text-white">
            A desktop for you.
            <br />
            <span className="bg-gradient-to-r from-[var(--color-cyan)] to-[var(--color-violet)] bg-clip-text text-transparent">
              A computer for your AI.
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-[clamp(1.0625rem,1rem+0.4vw,1.25rem)] leading-relaxed text-[var(--color-muted)]">
            Instantly available, browser-accessible Linux workstations — operable by you and by your
            AI agents, side by side. Boots in seconds, persists between sessions, scales to zero
            when idle.
          </p>

          <ul className="mt-8 flex flex-wrap gap-2.5" aria-label="Available desktop sizes">
            {sizes.map((s) => (
              <FeatureChip key={s.id} label={`${s.friendlyName} · ${s.ramGiB} GiB`} />
            ))}
          </ul>
        </section>

        {/* Right: auth (~38%). */}
        <div className="lg:basis-[38%]">
          <AuthPanel />
        </div>
      </div>
    </div>
  );
}

export default HomeOverlay;
