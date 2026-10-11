/**
 * deskl.ink BACK UP NOW — the on-demand "snapshot /home to durable R2" verb, end-to-end through the
 * real UI (live E2E).
 *
 * `POST /api/v1/desktops/:id/snapshot` streams a gzip tar of `/home` into R2 (durable truth) and
 * returns the TYPED `SnapshotResult` discriminated union — `{ ok: true, manifest }` on success, or an
 * HONEST `{ ok: false, kind, reason }` (never a 5xx). This test drives the per-tile metadata
 * affordance the manager now has — the subtle `desktop-backup` "Back up now" text button, shown only
 * while a computer is running — and proves a real running computer snapshots successfully: the POST
 * resolves `ok: true` AND the success toast ("Backed up <name>.") appears. That is the honest
 * "on-demand backup works on the website" proof, surfacing the already-proven persistence capability.
 *
 * ONE cohesive, stateful test in a SINGLE page context (mirrors golden-path + restart). Every
 * assertion keys on the desktop id captured from the create POST response, so it's hermetic +
 * parallel-safe: a concurrent run's computers can't satisfy or break it. Self-cleaning (the test
 * deletes its own computer; afterEach best-effort sweeps any residue via the page's cookie jar — the
 * SAME signed session principal that OWNS the desktop).
 *
 * The snapshot only succeeds once the container is actually running (its in-container backup agent
 * must answer), so we wait for `ready` before clicking — otherwise the route would honestly return a
 * `capability_gap`. Cold-start (image pull + desktop/VNC boot) is slow, hence the generous ready-wait.
 *
 * Run:  DESKL_BASE_URL=https://deskl.ink DESKL_TEST_AUTH=<secret> pnpm -C e2e test backup
 *
 * Testid values mirror `@deskl/shared` desktopTestIds (the affordance is `desktop-backup`).
 */
import { test, expect } from '@playwright/test';
import path from 'path';
import { enterApp } from './auth.js';

const T = {
  newComputerButton: 'new-computer-button',
  createConfirm: 'create-computer-confirm',
  tile: 'desktop-tile',
  tileStatus: 'desktop-status',
  backupButton: 'desktop-backup',
  statusAnnouncer: 'status-announcer',
} as const;

// Container cold-start (image pull + desktop/VNC boot) is slow; a snapshot needs the container
// running so its backup agent answers, so allow generous headroom for the ready-wait.
const READY_TIMEOUT_MS = 120_000;
// A real snapshot streams a gzip tar of /home into R2 — give the POST generous headroom.
const SNAPSHOT_TIMEOUT_MS = 60_000;
const SHOT_DIR = path.join(import.meta.dirname, 'screenshots', 'golden-path');

const BENIGN_CONSOLE = /favicon|ResizeObserver|Download the React DevTools/i;

test.describe('Back up now — the on-demand snapshot verb, through the UI', () => {
  let desktopId = '';

  // Best-effort residue sweep: the test deletes its own computer, but if it bails before that, don't
  // leak one. `page.request` shares the page's cookie jar → the SAME signed session principal that
  // OWNS the desktop (the separate `request` fixture is a different principal and would 404).
  test.afterEach(async ({ page }) => {
    if (desktopId) await page.request.delete(`/api/v1/desktops/${desktopId}`).catch(() => undefined);
  });

  test('back up a running computer: click Back up now → snapshot ok + success toast', async ({
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

    let desktopName = '';
    await test.step('2 · create a computer + capture its id + name from the POST response', async () => {
      const createResp = page.waitForResponse(
        (r) => r.url().endsWith('/api/v1/desktops') && r.request().method() === 'POST'
      );
      await page.getByTestId(T.newComputerButton).first().click();
      // The new-computer button opens the OS picker (Ubuntu pre-selected) → create the default.
      await expect(page.getByRole('dialog', { name: /choose your computer/i })).toBeVisible();
      await page.getByTestId(T.createConfirm).click();

      const resp = await createResp;
      expect(resp.ok(), 'create POST should succeed').toBeTruthy();
      const body = (await resp.json()).desktop;
      desktopId = body.id;
      desktopName = body.name;
      expect(desktopId, 'create returned a desktop id').toBeTruthy();
      expect(desktopName, 'create returned a desktop name').toBeTruthy();
    });

    const tile = page.locator(`[data-testid="${T.tile}"][data-desktop-id="${desktopId}"]`);
    const status = tile.getByTestId(T.tileStatus);

    await test.step('3 · container reaches ready (so its backup agent can answer)', async () => {
      await expect(tile).toBeVisible({ timeout: 20_000 });
      await expect(status).toHaveAttribute('data-status', 'ready', { timeout: READY_TIMEOUT_MS });
      // "Back up now" is offered only on a running/ready computer — the affordance must be present now.
      await expect(tile.getByTestId(T.backupButton)).toBeVisible();
      await page.screenshot({ path: path.join(SHOT_DIR, 'backup-01-ready.png') });
    });

    await test.step('4 · click Back up now → snapshot POST resolves ok:true', async () => {
      // The snapshot route ALWAYS returns 200 with a typed SnapshotResult (success OR honest failure,
      // never a 5xx) — so assert on the PARSED body's `ok`, not on resp.ok(). A running computer's
      // backup agent answers, so this is the success branch (`ok: true, manifest`).
      const snapResp = page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/v1/desktops/${desktopId}/snapshot`) &&
          r.request().method() === 'POST',
        { timeout: SNAPSHOT_TIMEOUT_MS }
      );
      await tile.getByTestId(T.backupButton).click();
      const resp = await snapResp;
      const result = await resp.json();
      expect(result.ok, `snapshot should succeed; got: ${JSON.stringify(result)}`).toBe(true);
      expect(result.manifest?.desktopId, 'manifest points at this desktop').toBe(desktopId);
      await page.screenshot({ path: path.join(SHOT_DIR, 'backup-02-snapshotted.png') });
    });

    await test.step('5 · the success toast confirms it to the user', async () => {
      // One shared live region IS the visible toast — assert the exact success copy for this computer.
      await expect(page.getByTestId(T.statusAnnouncer)).toContainText(`Backed up ${desktopName}.`, {
        timeout: 10_000,
      });
      // The affordance returns to its idle label (busy state cleared in `finally`).
      await expect(tile.getByTestId(T.backupButton)).toHaveText('Back up now');
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
