import { defineConfig } from 'vitest/config';

/**
 * Vitest config for the deskl.ink API worker.
 *
 * The suites here exercise the PURE control-plane arbiter (`SessionCoordinatorState`) and the shared
 * Zod contracts — plain TypeScript with no Workers runtime, so the default `node` environment is all
 * that's needed (no `@cloudflare/vitest-pool-workers`). `@deskl/shared` resolves through the pnpm
 * workspace symlink. DO-bound / fetch-level integration tests (which DO need the Workers pool) are a
 * later slice; keep those in a separate config when they land.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
