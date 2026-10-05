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

// Container cold-start (image pull + KDE Plasma/VNC boot) + noVNC connect can be slow.
const READY_TIMEOUT_MS = 120_000;
const DESKTOP_PAINT_TIMEOUT_MS = 90_000;
const SHOT_DIR = path.join(import.meta.dirname, 'screenshots', 'golden-path');

// Console noise that is not a deskl.ink app defect. `package.json` + the paired generic
// 404 come from noVNC's own cosmetic version check (it fetches package.json inside the
// iframe); deskl.ink's own resources are already proven present by the functional steps.
const BENIGN_CONSOLE =
  /favicon|ResizeObserver|Download the React DevTools|package\.json|Failed to load resource: the server responded with a status of 404/i;

/**
 * Prove the Linux desktop actually PAINTED over VNC — not merely that noVNC created its
 * <canvas>. The canvas is already "visible" during noVNC's blank "Connecting…" screen, so
 * instead we sample the framebuffer's pixels (the same-origin iframe lets us read the 2D
 * canvas backing store) and wait until it holds real, non-uniform content. THIS is the
 * honest "the desktop is loaded on the website" proof.
 */
async function waitForVncPaint(
  page: Page,
  viewportTestId: string,
  timeoutMs: number,
): Promise<void> {
  const canvas = page.frameLocator(`[data-testid="${viewportTestId}"]`).locator('canvas').first();
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(
      () =>
        canvas.evaluate((el) => {
          const c = el as HTMLCanvasElement;
          const ctx = c.getContext('2d');
          if (!ctx || !c.width || !c.height) return 0;
          let data: Uint8ClampedArray;
          try {
            data = ctx.getImageData(0, 0, c.width, c.height).data;
          } catch {
            return 0; // tainted/unreadable — keep polling
          }
          const colors = new Set<number>();
          const stride = Math.max(1, Math.floor(data.length / 4 / 2000)) * 4;
          for (let i = 0; i + 2 < data.length; i += stride) {
            colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
          }
          return colors.size; // distinct sampled colours: ~1 while blank, many once painted
        }),
      { timeout: timeoutMs, intervals: [1000, 1500, 2000, 3000] },
    )
    .toBeGreaterThan(4);
}

/**
 * Best-effort: wait for KDE's boot splash to clear into the themed desktop — detected by the
 * bottom PANEL appearing (the settled desktop shows its taskbar + clock across the bottom,
 * while the splash leaves the bottom near-black; a tiny bottom-right "Plasma made by KDE"
 * logo during the splash isn't enough to raise the full-width strip's mean). A plain
 * "frame stopped changing" check is fooled by the splash's static hold, and a center-darkness
 * check fires on the splash's small logo — the bottom strip is the reliable signal. Capped at
 * maxMs; screenshots whatever is showing if the panel never appears. Never fails the test.
 */
async function settleDesktop(page: Page, viewportTestId: string, maxMs: number): Promise<void> {
  const canvas = page.frameLocator(`[data-testid="${viewportTestId}"]`).locator('canvas').first();
  try {
    await expect
      .poll(
        () =>
          canvas.evaluate((el) => {
            const c = el as HTMLCanvasElement;
            const ctx = c.getContext('2d');
            if (!ctx || !c.width || !c.height) return 0;
            // Mean brightness of a full-width bottom strip (where the Plasma panel lives).
            const sh = Math.max(1, Math.floor(c.height * 0.08));
            let data: Uint8ClampedArray;
            try {
              data = ctx.getImageData(0, c.height - sh, c.width, sh).data;
            } catch {
              return 0;
            }
            let sum = 0;
            let n = 0;
            const stride = Math.max(1, Math.floor(data.length / 4 / 3000)) * 4;
            for (let i = 0; i + 2 < data.length; i += stride) {
              sum += data[i] + data[i + 1] + data[i + 2];
              n += 3;
            }
            return n ? Math.round(sum / n) : 0;
          }),
        { timeout: maxMs, intervals: [2000, 2500, 3000, 3000] },
      )
      .toBeGreaterThan(16); // bottom panel present → desktop settled
  } catch {
    /* panel didn't appear within the cap — screenshot whatever's showing (paint already proved it) */
  }
}

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

  test('spin up → VNC → visually confirm desktop → delete', async ({ page, request }) => {
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
      // The new-computer button opens the gorgeous OS picker (Ubuntu pre-selected).
      // Snapshot it, then create the default (Ubuntu) computer.
      if (await confirm.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await page.screenshot({ path: path.join(SHOT_DIR, '00-os-picker.png') });
        await confirm.click();
      }

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

      // The viewport iframe mounts only AFTER deskl.ink's own branded "CONNECTED…" phase,
      // so give it generous headroom (a tight 15s races that transition).
      const viewport = page.getByTestId(T.vncViewport);
      await expect(viewport).toBeVisible({ timeout: 60_000 });
      const box = await viewport.boundingBox();
      expect(box?.width ?? 0, 'VNC viewport width > 0').toBeGreaterThan(0);
      expect(box?.height ?? 0, 'VNC viewport height > 0').toBeGreaterThan(0);

      // The viewport is a same-origin <iframe> loading noVNC. Wait for noVNC to actually
      // PAINT its framebuffer (non-uniform pixels) — not just create the canvas — which is
      // the honest proof that the Linux desktop rendered on the website.
      await waitForVncPaint(page, T.vncViewport, DESKTOP_PAINT_TIMEOUT_MS);
      // Let KDE's boot splash settle into the themed desktop before the proof screenshot.
      await settleDesktop(page, T.vncViewport, 60_000);

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
      // Verify the DESTROY leg FOR REAL: the UI removes the tile optimistically BEFORE the
      // DELETE round-trips, so assert the backend resource is actually gone (404). This also
      // keeps the page alive until the delete completes — otherwise the request aborts on
      // teardown and the backstop sweep masks whether the UI delete truly destroyed it.
      await expect
        .poll(async () => (await request.get(`/api/v1/desktops/${desktopId}`)).status(), {
          timeout: 15_000,
        })
        .toBe(404);
      await page.screenshot({ path: path.join(SHOT_DIR, '03-deleted.png') });
      desktopId = ''; // destroyed + confirmed gone — nothing for afterEach to clean up.
    });

    expect(consoleErrors, `unexpected console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });
});
