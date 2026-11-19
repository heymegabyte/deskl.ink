# theme.tools — vendored `@theme.tools` design-system surface

This directory is the app's adoption of the estate **`@theme.tools`** design system
(`heymegabyte/theme.tools`, MIT). The canonical packages (`@theme-tools/ui`,
`@theme-tools/themes`) are a **pnpm monorepo** whose `workspace:*` dependencies cannot
be resolved by this standalone npm project, so the generically-reusable surface is
vendored here, byte-faithful to the upstream `dist/` output and adapted to this app's
Tailwind v4 token layer.

What is vendored (the universal surface — NOT the 400+ `field-service/*` domain
components, which belong to an unrelated moving-company app):

- **`tt-physics.ts`** — the pure micro-interaction helpers the primitives use
  (`spawnTactileRipple`, `computeCursorSpotlight`, `computeMagneticPull`,
  `detectHoverEntryQuadrant`, `computeCopyMorphState`, `computePerspectiveTiltGlare`,
  `interpolateOdometerDigits`, `computeSparklineScrubPoint`,
  `computeSynchronizedShimmerDelay`, `computeLoadingDimensionsLock`) + `cn`.
- **`Button.tsx` · `Card.tsx` · `Input.tsx` · `Badge.tsx` · `StatCard.tsx`** — the 5
  token-driven React 19 primitives from `@theme-tools/ui` (`bg-primary`,
  `text-foreground`, 0.333s spring transitions, 16 interaction states).
- **`OrbitalLoadingSpinner`** — the Button/StatCard loading spinner from the upstream
  `foundation/states`.

The OKLCH design TOKENS (`--primary`, `--card`, `--border`, `--ring`, the Sora /
Space Grotesk / JetBrains Mono ramp) live in `src/web/styles.css` `@theme` + `@layer
base`, adopted verbatim from `@theme-tools/themes/dist/tokens.css`; the tactile CSS
(`[data-cursor-ripple]`, `.tt-spring-press`, `.tt-shimmer`, …) lives in the
`@layer theme-tools-tactile` block there. The primitives consume those tokens, so they
render in the app's black `#060610` / cyan `#00E5FF` brand automatically.

To upgrade: re-copy the five component bodies + the used `tt-physics` helpers from
`heymegabyte/theme.tools` `packages/ui/dist` and re-copy `packages/themes/dist/tokens.css`.
