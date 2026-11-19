import { Suspense, lazy } from 'react';
import { DESKTOP_SIZES } from '@deskl/shared';
import { AuthPanel } from './AuthPanel.js';
import { Wordmark } from './Logo.js';
import { Badge } from './theme.tools/index.js';

// Lazy-load the WebGL/canvas hero so it stays out of the main bundle.
const HeroCanvas = lazy(() => import('./HeroCanvas.js'));

/** A compact feature chip rendered in the left product column — the `@theme.tools/ui`
 *  Badge (enumerable values render as pills, never comma-joined text). The `<li>` keeps
 *  the list semantics (`contents` so it adds no box) while Badge renders the pill. */
function FeatureChip({ label }: { label: string }) {
  return (
    <li className="contents">
      <Badge
        variant="outline"
        className="rounded-full px-3.5 py-1.5 text-xs font-500 text-[var(--color-white)]"
      >
        {label}
      </Badge>
    </li>
  );
}

/**
 * HomeOverlay — the LOGIN GATE. deskl.ink requires a real account (Google / GitHub / email magic
 * link), so this full-screen layer shows until the user is authenticated; there is no dismiss / no
 * guest access. Left ~62%: the product experience over the living nebula. Right ~38%: the sign-in
 * panel. Collapses to a single column on mobile.
 */
export function HomeOverlay() {
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

      {/* Brand mark, top-left. (No dismiss control — this is the login gate.) */}
      <div className="absolute left-6 top-5 z-10">
        <Wordmark size={32} textClassName="text-xl" />
      </div>

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

        {/* Right: the sign-in panel (~38%) — Google / GitHub / email magic link. */}
        <div className="lg:basis-[38%]">
          <AuthPanel />
        </div>
      </div>
    </div>
  );
}

export default HomeOverlay;
