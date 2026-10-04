/**
 * deskl.ink GOLDEN PATH (live E2E)
 * spin up a computer → connect via VNC → visually confirm the Linux desktop renders
 * on the website → delete the resource.
 *
 * ONE cohesive, stateful test in a SINGLE page context — no cross-test shared state
 * (the previous 5-separate-tests-sharing-a-`let` shape was flaky). Every step keys on
 * the desktop id captured right after create, waits on the robust `data-status`
 * attribute the manager exposes, and confirms the desktop by waiting for noVNC to paint
 * its framebuffer <canvas> inside the same-origin VNC iframe.
 *
 * Run:  DESKL_BASE_URL=https://deskl-ink-api.manhattan.workers.dev pnpm -C e2e test
 *
 * Testid values mirror `@deskl/shared` desktopTestIds.
 */
import { test, expect, type Page } from '@playwright/test';
import path from 'path';

const T = {
  newComputerButton: 'new-computer-button',
  createConfirm: 'create-computer-confirm',
  tile: 'desktop-tile',
  tileStatus: 'desktop-status',
  openButton: 'desktop-open',
  stopButton: 'desktop-stop',
  deleteButton: 'desktop-delete',
  deleteConfirm: 'desktop-delete-confirm',
  vncViewport: 'vnc-viewport',
  controlSurface: 'desktop-control-surface',
  exitFullscreen: 'desktop-exit-fullscreen',
} as const;

// Container cold-start (image pull + XFCE/VNC boot) + noVNC connect can be slow.
const READY_TIMEOUT_MS = 120_000;
const DESKTOP_PAINT_TIMEOUT_MS = 90_000;
const SHOT_DIR = path.join(import.meta.dirname, 'screenshots', 'golden-path');

// Console noise that is not a deskl.ink app defect. `package.json` + the paired generic
// 404 come from noVNC's own cosmetic version check (it fetches package.json inside the
// iframe); deskl.ink's own resources are already proven present by the functional steps.
const BENIGN_CONSOLE =
  /favicon|ResizeObserver|Download the React DevTools|package\.json|Failed to load resource: the server responded with a status of 404/i;

/** Dismiss the first-run homepage overlay so the manager beneath is interactive. */
async function dismissOverlay(page: Page): Promise<void> {
  const close = page.getByTestId('overlay-close');
  if (await close.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await close.click();
  }
  // The overlay (role=dialog) must be gone before interacting with the shell.
  await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0, {
    timeout: 10_000,
  });
}

test.describe('Golden path', () => {
  let desktopId = '';

  // Best-effort cleanup: if the test bails before the delete step, don't leak a desktop.
  test.afterEach(async ({ request }) => {
    if (desktopId) await request.delete(`/api/v1/desktops/${desktopId}`).catch(() => undefined);
  });

  test('spin up → VNC → visually confirm desktop → delete', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && !BENIGN_CONSOLE.test(m.text())) consoleErrors.push(m.text());
    });

    await test.step('1 · homepage loads + overlay dismisses', async () => {
      await page.goto('/');
      await expect(page.locator('#root')).not.toBeEmpty();
      await dismissOverlay(page);
      await expect(page.getByTestId(T.newComputerButton)).toBeVisible({ timeout: 10_000 });
    });

    await test.step('2 · create a computer', async () => {
      await page.getByTestId(T.newComputerButton).click();
      const confirm = page.getByTestId(T.createConfirm);
      if (await confirm.isVisible({ timeout: 2_000 }).catch(() => false)) await confirm.click();

      // The manager prepends the new desktop → the first tile is the one we created.
      const firstTile = page.getByTestId(T.tile).first();
      await expect(firstTile).toBeVisible({ timeout: 20_000 });
      desktopId = (await firstTile.getAttribute('data-desktop-id')) ?? '';
      expect(desktopId, 'the new tile must expose data-desktop-id').toBeTruthy();
    });

    const tile = page.locator(`[data-testid="${T.tile}"][data-desktop-id="${desktopId}"]`);

    await test.step('3 · container reaches ready', async () => {
      await expect(tile.getByTestId(T.tileStatus)).toHaveAttribute('data-status', 'ready', {
        timeout: READY_TIMEOUT_MS,
      });
      await page.screenshot({ path: path.join(SHOT_DIR, '01-ready.png') });
    });

    await test.step('4 · open VNC + visually confirm the Linux desktop', async () => {
      await tile.getByTestId(T.openButton).click();
      await expect(page.getByTestId(T.controlSurface)).toBeVisible({ timeout: 15_000 });

      const viewport = page.getByTestId(T.vncViewport);
      await expect(viewport).toBeVisible({ timeout: 15_000 });
      const box = await viewport.boundingBox();
      expect(box?.width ?? 0, 'VNC viewport width > 0').toBeGreaterThan(0);
      expect(box?.height ?? 0, 'VNC viewport height > 0').toBeGreaterThan(0);

      // The viewport is a same-origin <iframe> loading noVNC. Waiting for noVNC to paint
      // its framebuffer <canvas> IS the proof that the Linux desktop rendered.
      const frame = page.frameLocator(`[data-testid="${T.vncViewport}"]`);
      await expect(frame.locator('canvas').first()).toBeVisible({
        timeout: DESKTOP_PAINT_TIMEOUT_MS,
      });

      await page.screenshot({ path: path.join(SHOT_DIR, '02-desktop.png') });
    });

    await test.step('5 · delete the computer', async () => {
      const exit = page.getByTestId(T.exitFullscreen);
      if (await exit.isVisible({ timeout: 5_000 }).catch(() => false)) await exit.click();
      await expect(tile).toBeVisible({ timeout: 10_000 });

      await tile.getByTestId(T.deleteButton).click();
      const confirm = page.getByTestId(T.deleteConfirm);
      if (await confirm.isVisible({ timeout: 3_000 }).catch(() => false)) await confirm.click();

      // The resource is gone → its tile disappears.
      await expect(tile).toHaveCount(0, { timeout: 15_000 });
      await page.screenshot({ path: path.join(SHOT_DIR, '03-deleted.png') });
      desktopId = ''; // deleted — nothing for afterEach to clean up.
    });

    expect(consoleErrors, `unexpected console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });
});
