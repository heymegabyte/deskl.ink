/**
 * deskl.ink RESTART — the "restart a computer" verb, end-to-end through the real UI (live E2E).
 *
 * `POST /api/v1/desktops/:id/restart` CHECKPOINTS `/home`, then stop→start (a durable restart that
 * never loses user work), and returns the ready desktop. This test drives that verb through the UI
 * affordance it now has — the per-tile `desktop-restart` circular-arrow button — and proves the tile
 * leaves `ready`, moves through a transient lifecycle state (persisting/starting), and returns to a
 * running/ready state. That full arc is the honest "restart works on the website" proof.
 *
 * ONE cohesive, stateful test in a SINGLE page context (mirrors golden-path + delete-no-resurrect).
 * Every assertion keys on the desktop id captured from the create POST response, so it is hermetic +
 * parallel-safe: a concurrent run's computers can't satisfy or break it. Self-cleaning (the test
 * deletes its own computer; afterEach best-effort sweeps any residue via the page's cookie jar — the
 * SAME signed session principal that OWNS the desktop).
 *
 * Restart does a REAL checkpoint + container stop + start, so the return-to-ready gets a generous
 * timeout (~90s on top of the initial cold-start wait).
 *
 * Run:  DESKL_BASE_URL=https://deskl.ink DESKL_TEST_AUTH=<secret> pnpm -C e2e test restart
 *
 * Testid values mirror `@deskl/shared` desktopTestIds.
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import { enterApp } from './auth.js';

const T = {
  newComputerButton: 'new-computer-button',
  createConfirm: 'create-computer-confirm',
  tile: 'desktop-tile',
  tileStatus: 'desktop-status',
  restartButton: 'desktop-restart',
  stopButton: 'desktop-stop',
} as const;

// Container cold-start (image pull + desktop/VNC boot) is slow; a restart does a full
// checkpoint + stop + start on top, so allow generous headroom for each ready-wait.
const READY_TIMEOUT_MS = 120_000;
const RESTART_READY_TIMEOUT_MS = 90_000;
// A transient lifecycle state the restart passes through (set `persisting` optimistically; the
// backend drives persisting→starting→ready). Polls are ~2s, so the window is brief — sample fast.
const TRANSIENT_TIMEOUT_MS = 20_000;
const SHOT_DIR = path.join(import.meta.dirname, 'screenshots', 'golden-path');

const BENIGN_CONSOLE = /favicon|ResizeObserver|Download the React DevTools/i;

test.describe('Restart — the restart verb, through the UI', () => {
  let desktopId = '';

  // Best-effort residue sweep: the test deletes its own computer, but if it bails before that,
  // don't leak one. `page.request` shares the page's cookie jar → the SAME signed session principal
  // that OWNS the desktop (the separate `request` fixture is a different principal and would 404).
  test.afterEach(async ({ page }) => {
    if (desktopId) await page.request.delete(`/api/v1/desktops/${desktopId}`).catch(() => undefined);
  });

  test('restart a running computer: ready → transient → ready, via desktop-restart', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && !BENIGN_CONSOLE.test(m.text())) consoleErrors.push(m.text());
    });

    await test.step('1 · sign in + load the app', async () => {
      await enterApp(page); // dev-login (no OAuth) → the authenticated manager
      await expect(page.locator('#root')).not.toBeEmpty();
      await expect(page.getByTestId(T.newComputerButton).first()).toBeVisible({ timeout: 15_000 });
    });

    await test.step('2 · create a computer + capture its id from the POST response', async () => {
      const createResp = page.waitForResponse(
        (r) => r.url().endsWith('/api/v1/desktops') && r.request().method() === 'POST'
      );
      await page.getByTestId(T.newComputerButton).first().click();
      // The new-computer button opens the OS picker (Ubuntu pre-selected) → create the default.
      await expect(page.getByRole('dialog', { name: /choose your computer/i })).toBeVisible();
      await page.getByTestId(T.createConfirm).click();

      const resp = await createResp;
      expect(resp.ok(), 'create POST should succeed').toBeTruthy();
      desktopId = (await resp.json()).desktop.id;
      expect(desktopId, 'create returned a desktop id').toBeTruthy();
    });

    const tile = page.locator(`[data-testid="${T.tile}"][data-desktop-id="${desktopId}"]`);
    const status = tile.getByTestId(T.tileStatus);

    await test.step('3 · container reaches ready (so it is restartable)', async () => {
      await expect(tile).toBeVisible({ timeout: 20_000 });
      await expect(status).toHaveAttribute('data-status', 'ready', { timeout: READY_TIMEOUT_MS });
      // Restart is only offered on a running/ready computer — the affordance must be present now.
      await expect(tile.getByTestId(T.restartButton)).toBeVisible();
      await page.screenshot({ path: path.join(SHOT_DIR, 'restart-01-ready.png') });
    });

    await test.step('4 · click Restart → the tile leaves ready into a transient state', async () => {
      await tile.getByTestId(T.restartButton).click();
      // The restart goes persisting→starting→ready; the UI sets `persisting` optimistically. Assert
      // the tile is NO LONGER `ready` (it moved into a transient lifecycle state) — robust to which
      // transient state a given poll samples (persisting | starting | stopping).
      await expect
        .poll(async () => await status.getAttribute('data-status'), {
          timeout: TRANSIENT_TIMEOUT_MS,
          intervals: [200, 300, 500],
        })
        .not.toBe('ready');
      // And it's one of the expected restart states — not `failed` or anything unexpected.
      const transient = await status.getAttribute('data-status');
      expect(
        ['persisting', 'starting', 'stopping', 'restoring'],
        `unexpected transient status "${transient}" after clicking Restart`
      ).toContain(transient);
      await page.screenshot({ path: path.join(SHOT_DIR, 'restart-02-transient.png') });
    });

    await test.step('5 · the computer returns to ready (checkpoint + stop + start completed)', async () => {
      // Restart does a REAL checkpoint + container stop + start, so allow generous headroom. The
      // settling poll in the manager tracks the backend through to `ready`.
      await expect(status).toHaveAttribute('data-status', 'ready', {
        timeout: RESTART_READY_TIMEOUT_MS,
      });
      // Still restartable after the cycle (idempotent verb, honest running state).
      await expect(tile.getByTestId(T.restartButton)).toBeVisible();
      await page.screenshot({ path: path.join(SHOT_DIR, 'restart-03-ready-again.png') });
    });

    await test.step('6 · clean up (delete the computer we created)', async () => {
      const del = await page.request.delete(`/api/v1/desktops/${desktopId}`);
      expect(del.ok(), 'cleanup delete should succeed').toBeTruthy();
      // Confirmed destroyed — nothing for afterEach to sweep.
      desktopId = '';
    });

    expect(consoleErrors, `unexpected console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });
});
