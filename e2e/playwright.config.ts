import { defineConfig, devices } from '@playwright/test';
import path from 'path';

/**
 * deskl.ink golden-path Playwright configuration.
 *
 * - baseURL defaults to local Vite dev server; override with DESKL_BASE_URL for prod runs.
 * - Container cold-start is slow (~60-120s) — actionTimeout is generous.
 * - Screenshots are taken on failure and at explicit step snapshots.
 * - Traces captured on first retry to aid debugging.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',

  /* After the suite, destroy any leftover desktops so the monitor never leaks a
     running container (catches strays from overlapping / interrupted runs). */
  globalTeardown: path.join(import.meta.dirname, 'global-teardown.ts'),

  /* Generous timeouts — container spin-up from cold can take 90-120s */
  timeout: 3 * 60 * 1_000, // 3 min per test
  expect: {
    timeout: 5_000,
  },

  /* Run tests serially — the golden path is stateful (create → VNC → delete). */
  fullyParallel: false,
  workers: 1,

  /* Fail fast on first failure so we don't rack up costs against a live container. */
  retries: 0,

  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],

  use: {
    baseURL: process.env['DESKL_BASE_URL'] ?? 'http://localhost:5173',

    /* Capture a screenshot on every failure + at explicit `page.screenshot()` calls. */
    screenshot: 'only-on-failure',

    /* Trace on first retry — keeps the ZIP for post-mortem inspection. */
    trace: 'on-first-retry',

    /* Emulate a real desktop browser — avoid bot-detection heuristics. */
    viewport: { width: 1280, height: 800 },
    userAgent: undefined, // Playwright default (real Chrome UA)

    /* Container ready-wait is the longest step — override per-action timeout here. */
    actionTimeout: 120_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Screenshot output lives beside the spec so CI can upload them as artifacts. */
  outputDir: path.join(import.meta.dirname, 'screenshots', 'golden-path'),
  snapshotDir: path.join(import.meta.dirname, 'screenshots', 'golden-path'),
});
