/**
 * Golden-path E2E — spin up a computer, connect via VNC, visually confirm the Linux desktop
 * loaded in the browser, then delete the resource.
 *
 * TDD-first: this test is intentionally RED until the container backend is deployed.
 * Expected failures on a fresh checkout:
 *   - `new-computer-button` not found     → dashboard UI not yet built
 *   - `desktop-status` never reaches "ready" → container worker not deployed
 *   - `vnc-viewport` not visible          → VNC proxy route not wired
 *
 * Testid values mirror @deskl/shared `desktopTestIds` exactly.
 * If that export path changes, update the TESTIDS constant below to match.
 *
 * Run:
 *   DESKL_BASE_URL=https://deskl.ink pnpm -C e2e test
 *   DESKL_BASE_URL=http://localhost:5173 pnpm -C e2e test
 */

import { test, expect, type Page } from '@playwright/test';
import path from 'path';

// ---------------------------------------------------------------------------
// Testid constants — mirror @deskl/shared desktopTestIds.
// Import from the package when the monorepo is fully wired; hardcoded here for
// zero-dependency E2E bootstrap (Playwright config doesn't resolve workspace deps).
// ---------------------------------------------------------------------------
const TESTIDS = {
  newComputerButton: 'new-computer-button',
  createConfirm: 'create-computer-confirm',
  tile: 'desktop-tile', // carries data-desktop-id
  tileStatus: 'desktop-status',
  openButton: 'desktop-open',
  stopButton: 'desktop-stop',
  deleteButton: 'desktop-delete',
  deleteConfirm: 'desktop-delete-confirm',
  vncViewport: 'vnc-viewport', // wraps the noVNC canvas/iframe
  controlSurface: 'desktop-control-surface',
  exitFullscreen: 'desktop-exit-fullscreen',
} as const;

/** Baseline byte-size below which a screenshot is considered "blank" (< 5 KiB). */
const BLANK_SCREENSHOT_THRESHOLD_BYTES = 5_120;

/** How long to wait for the desktop container to reach "ready" status (90 s). */
const CONTAINER_READY_TIMEOUT_MS = 90_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Dismiss the homepage overlay if it is present.
 * The overlay is a first-run screen that sits on top of the app shell.
 * If it is already dismissed (sessionStorage flag set) this is a no-op.
 */
async function dismissOverlayIfPresent(page: Page): Promise<void> {
  // The overlay renders a visually prominent "Enter" / close affordance.
  // Try common close selectors; if none are found within 3s the overlay is
  // already gone and we proceed silently.
  const closeSelectors = [
    '[aria-label="Close"]',
    '[aria-label="Dismiss"]',
    '[aria-label="Enter"]',
    '[data-testid="overlay-close"]',
    '[data-testid="overlay-enter"]',
    'button:has-text("Enter")',
    'button:has-text("Get started")',
    'button:has-text("Continue")',
    'button[aria-label*="close" i]',
  ];

  for (const selector of closeSelectors) {
    const el = page.locator(selector).first();
    // A short timeout — if the overlay is not present we move on quickly.
    const visible = await el.isVisible().catch(() => false);
    if (visible) {
      await el.click();
      // Wait until the overlay is no longer in the DOM / visible.
      await page
        .locator('[data-testid="overlay-close"], [data-testid="overlay-enter"]')
        .waitFor({ state: 'hidden' })
        .catch(() => undefined);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// The golden path (single serial stateful test)
// ---------------------------------------------------------------------------

test.describe('Golden path — spin up computer → VNC → delete', () => {
  /** Desktop id captured from the tile's data attribute; shared across steps. */
  let desktopId: string;

  // Collect console errors throughout the entire run.
  const consoleErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
  });

  // ── Step 1: homepage ────────────────────────────────────────────────────
  test('1 — homepage loads and overlay can be dismissed', async ({ page }) => {
    await page.goto('/');

    // Page must render content — not a blank white screen.
    await expect(page.locator('body')).not.toBeEmpty();

    await dismissOverlayIfPresent(page);

    // After dismissal the app shell should be visible.
    // We assert the new-computer button is reachable (may be inside a nav, header,
    // or empty-state CTA depending on implementation).
    await expect(page.getByTestId(TESTIDS.newComputerButton)).toBeVisible({ timeout: 10_000 });
  });

  // ── Step 2: create a computer ───────────────────────────────────────────
  test('2 — create a new computer', async ({ page }) => {
    await page.goto('/');
    await dismissOverlayIfPresent(page);

    // Navigate via click — real user flow.
    await page.getByTestId(TESTIDS.newComputerButton).click();

    // Some implementations open a confirmation modal before provisioning.
    const confirmButton = page.getByTestId(TESTIDS.createConfirm);
    const confirmVisible = await confirmButton.isVisible({ timeout: 3_000 }).catch(() => false);
    if (confirmVisible) {
      await confirmButton.click();
    }

    // A desktop tile must appear in the list.
    const tile = page.getByTestId(TESTIDS.tile).first();
    await expect(tile).toBeVisible({ timeout: 15_000 });

    // Capture the desktop id from the tile's data attribute.
    const rawId = await tile.getAttribute('data-desktop-id');
    expect(rawId, 'tile must have data-desktop-id attribute').toBeTruthy();
    desktopId = rawId!;
  });

  // ── Step 3: wait for container to reach "ready" ─────────────────────────
  test('3 — container reaches ready status', async ({ page }) => {
    await page.goto('/');
    await dismissOverlayIfPresent(page);

    // Re-locate the tile using the id captured in step 2.
    // (Tests share state via the outer `desktopId` variable — intentional for
    //  this serial golden-path suite.)
    expect(desktopId, 'desktopId must be set by step 2').toBeTruthy();

    const tile = page
      .locator(`[data-testid="${TESTIDS.tile}"][data-desktop-id="${desktopId}"]`)
      .first();

    await expect(tile).toBeVisible({ timeout: 10_000 });

    // Poll the status badge until it reads "ready".
    // Container cold-start from scratch can take up to 90 s.
    const statusBadge = tile.getByTestId(TESTIDS.tileStatus);
    await expect
      .poll(
        async () => {
          const text = await statusBadge.textContent();
          return text?.toLowerCase().trim();
        },
        {
          message: `Waiting for desktop ${desktopId} to reach "ready"`,
          timeout: CONTAINER_READY_TIMEOUT_MS,
          intervals: [2_000, 3_000, 5_000],
        }
      )
      .toContain('ready');

    // Screenshot — proof the container is ready.
    await page.screenshot({
      path: path.join(import.meta.dirname, 'screenshots', 'golden-path', '01-ready.png'),
      fullPage: false,
    });
  });

  // ── Step 4: open VNC and visually confirm the Linux desktop ─────────────
  test('4 — VNC viewport renders the Linux desktop', async ({ page }) => {
    await page.goto('/');
    await dismissOverlayIfPresent(page);

    expect(desktopId, 'desktopId must be set by step 2').toBeTruthy();

    const tile = page
      .locator(`[data-testid="${TESTIDS.tile}"][data-desktop-id="${desktopId}"]`)
      .first();

    // Click the "Open" button on the tile — enters the full-screen VNC view.
    await tile.getByTestId(TESTIDS.openButton).click();

    // ── Assert fullscreen / VNC route is active ──────────────────────────
    // The app should transition to a full-screen VNC view. We assert the
    // control surface wrapper and the VNC viewport are both visible.
    const controlSurface = page.getByTestId(TESTIDS.controlSurface);
    await expect(controlSurface).toBeVisible({ timeout: 15_000 });

    const vncViewport = page.getByTestId(TESTIDS.vncViewport);
    await expect(vncViewport).toBeVisible({ timeout: 15_000 });

    // ── Assert the VNC viewport has a non-zero size ──────────────────────
    const box = await vncViewport.boundingBox();
    expect(box, 'vnc-viewport must have non-zero dimensions').not.toBeNull();
    expect(box!.width, 'vnc-viewport width must be > 0').toBeGreaterThan(0);
    expect(box!.height, 'vnc-viewport height must be > 0').toBeGreaterThan(0);

    // ── Wait for the embedded noVNC iframe / canvas to load ──────────────
    // noVNC renders inside an <iframe> or directly into a <canvas>. We give it
    // up to 30 s to load its HTML (the `load` event on the frame).
    // If no iframe is present the app may use a raw canvas directly — both are valid.
    const iframeExists = await vncViewport.locator('iframe').count();
    if (iframeExists > 0) {
      // Wait for the iframe's document to finish loading.
      await expect(vncViewport.locator('iframe')).toBeAttached({ timeout: 30_000 });

      // Confirm the iframe src / srcdoc is populated (not blank).
      const frameSrc = await vncViewport.locator('iframe').getAttribute('src');
      expect(frameSrc, 'VNC iframe must have a non-empty src attribute').toBeTruthy();
    }

    // ── Best-effort visual confirmation: screenshot must not be blank ────
    //
    // We take a screenshot of the VNC viewport region and assert the file is
    // larger than a blank-page threshold. This is a best-effort heuristic —
    // an AI-vision pass (Stagehand / Claude vision) is layered on top in a
    // later fire to provide semantic confirmation ("is this a Linux desktop?").
    //
    // Wait for a <canvas> or <img> inside the VNC viewport to appear —
    // noVNC renders its framebuffer into a canvas element.
    await vncViewport
      .locator('canvas, iframe')
      .first()
      .waitFor({ state: 'attached', timeout: 30_000 })
      .catch(() => {
        // No canvas/iframe found — may be a different noVNC integration.
        // Proceed to the screenshot check anyway.
      });

    const screenshotBuffer = await vncViewport.screenshot();
    await page.screenshot({
      path: path.join(import.meta.dirname, 'screenshots', 'golden-path', '02-desktop.png'),
      fullPage: false,
    });

    expect(
      screenshotBuffer.byteLength,
      `VNC viewport screenshot (${screenshotBuffer.byteLength} B) is suspiciously small — likely blank`
    ).toBeGreaterThan(BLANK_SCREENSHOT_THRESHOLD_BYTES);

    // TODO(ai-vision-pass): once Stagehand is wired, add a rubric check here:
    //   const stagehand = new Stagehand({ page });
    //   const result = await stagehand.act('Describe what is visible in the VNC viewport');
    //   expect(result).toContain('desktop'); // or whatever the rubric returns
  });

  // ── Step 5: exit fullscreen, delete the computer ────────────────────────
  test('5 — exit fullscreen and delete the computer', async ({ page }) => {
    expect(desktopId, 'desktopId must be set by step 2').toBeTruthy();

    // If VNC is open from step 4 we need to exit. Navigate from the current
    // state — the exit-fullscreen button should be visible.
    const exitBtn = page.getByTestId(TESTIDS.exitFullscreen);
    const exitVisible = await exitBtn.isVisible({ timeout: 3_000 }).catch(() => false);
    if (exitVisible) {
      await exitBtn.click();
      // Return to the desktop list view.
      await expect(page.getByTestId(TESTIDS.tile).first()).toBeVisible({ timeout: 10_000 });
    } else {
      // We may have landed here after a navigation — go to the homepage.
      await page.goto('/');
      await dismissOverlayIfPresent(page);
    }

    // Locate the tile for the desktop we created.
    const tile = page
      .locator(`[data-testid="${TESTIDS.tile}"][data-desktop-id="${desktopId}"]`)
      .first();

    await expect(tile).toBeVisible({ timeout: 10_000 });

    // Click the delete button on the tile.
    await tile.getByTestId(TESTIDS.deleteButton).click();

    // A confirmation dialog may appear.
    const confirmDelete = page.getByTestId(TESTIDS.deleteConfirm);
    const confirmVisible = await confirmDelete.isVisible({ timeout: 3_000 }).catch(() => false);
    if (confirmVisible) {
      await confirmDelete.click();
    }

    // The tile for the deleted desktop must be gone.
    await expect(
      page.locator(`[data-testid="${TESTIDS.tile}"][data-desktop-id="${desktopId}"]`)
    ).toHaveCount(0, { timeout: 15_000 });

    // Screenshot — proof the resource was deleted.
    await page.screenshot({
      path: path.join(import.meta.dirname, 'screenshots', 'golden-path', '03-deleted.png'),
      fullPage: false,
    });
  });

  // ── Console-error gate ───────────────────────────────────────────────────
  test.afterAll(async () => {
    // Fail the run if any console errors accumulated during the suite.
    // Common sources: CSP violations, unhandled promise rejections, network errors.
    if (consoleErrors.length > 0) {
      throw new Error(
        `Console errors detected during golden-path run:\n${consoleErrors
          .map((e, i) => `  ${i + 1}. ${e}`)
          .join('\n')}`
      );
    }
  });
});
