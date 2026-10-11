/**
 * deskl.ink DELETE — A DELETED COMPUTER NEVER REAPPEARS (live E2E)
 *
 * P0 regression guard for the "deletion flicker": a delete can race an IN-FLIGHT list poll
 * (`POLL_MS = 2000` in DesktopManager.tsx) whose response still contains the just-removed
 * computer; without a guard that stale response REINSERTS the tile (the
 * "disappears → reappears → disappears" flicker). The fix is an authoritative client TOMBSTONE
 * (`tombstonedRef`): the id is tombstoned the instant delete is requested, and every list
 * reconcile filters tombstones out — so a stale / late / mid-cleanup poll can NEVER resurrect
 * the tile. This also covers Golden Path A steps 11–12 (delete → stays gone).
 *
 * This test deletes through the REAL UI affordance (trash `desktop-delete` → the manager-level
 * confirmation-dialog `desktop-delete-confirm` → confirm), then holds the page alive for
 * ≥3 poll cycles (~6s) asserting the tile never re-renders AND the list GET no longer returns
 * the id, and finally hard-reloads to prove the SERVER no longer has it.
 *
 * Hermetic + parallel-safe: every assertion is scoped to the id captured at create time, so a
 * concurrent run's computers can't satisfy or break it. Self-cleaning (the computer is deleted
 * by the test; afterEach best-effort sweeps any residue). Delete is valid from any lifecycle
 * state, so this does NOT wait for the container to reach `ready`.
 *
 * Run:  DESKL_BASE_URL=https://deskl.ink DESKL_TEST_AUTH=<secret> pnpm -C e2e test delete-no-resurrect
 *
 * Testid values mirror `@deskl/shared` desktopTestIds.
 */
import { test, expect } from '@playwright/test';
import { enterApp } from './auth.js';

const BENIGN_CONSOLE = /favicon|ResizeObserver|Download the React DevTools/i;

/** DesktopManager's list-poll cadence (ms) — the stale-poll window the tombstone must defeat. */
const POLL_MS = 2_000;
/** Watch for ≥3 poll cycles; a resurrect would land on one of these edges. */
const WATCH_MS = 6_000;
/** Sampling cadence while watching — many samples per poll cycle so a 1-frame flicker can't hide. */
const SAMPLE_MS = 500;

test.describe('Delete — a deleted computer never reappears', () => {
  let createdId = '';

  // Best-effort residue sweep: the test deletes the computer itself, but if it bails before that
  // (or an extra slipped in), don't leak one. `page.request` shares the page's cookie jar → the
  // SAME signed session principal that OWNS the desktop (the separate `request` fixture is a
  // different principal and would 404 on it).
  test.afterEach(async ({ page }) => {
    if (createdId) {
      await page.request.delete(`/api/v1/desktops/${createdId}`).catch(() => undefined);
    }
  });

  test('deleting a tile tombstones it so no stale/in-flight poll can resurrect it', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && !BENIGN_CONSOLE.test(m.text())) consoleErrors.push(m.text());
    });

    await test.step('1 · sign in + load the app', async () => {
      await enterApp(page); // dev-login (no OAuth) → the authenticated manager
      await expect(page.locator('#root')).not.toBeEmpty();
      await expect(page.getByTestId('new-computer-button').first()).toBeVisible({ timeout: 15_000 });
    });

    await test.step('2 · create a computer + capture its id from the POST response', async () => {
      const createResp = page.waitForResponse(
        (r) => r.url().endsWith('/api/v1/desktops') && r.request().method() === 'POST'
      );
      await page.getByTestId('new-computer-button').first().click();
      // The new-computer button opens the OS picker (Ubuntu pre-selected) → create the default.
      await expect(page.getByRole('dialog', { name: /choose your computer/i })).toBeVisible();
      await page.getByTestId('create-computer-confirm').click();

      const resp = await createResp;
      expect(resp.ok(), 'create POST should succeed').toBeTruthy();
      createdId = (await resp.json()).desktop.id;
      expect(createdId, 'create returned a desktop id').toBeTruthy();
    });

    const tile = page.locator(`[data-testid="desktop-tile"][data-desktop-id="${createdId}"]`);

    await test.step('3 · its tile is visible', async () => {
      await expect(tile).toBeVisible({ timeout: 15_000 });
    });

    await test.step('4 · delete via the real UI affordance (trash → confirmation dialog → confirm)', async () => {
      // Click the per-tile trash button → DesktopManager sets pendingDelete=id, which opens the ONE
      // manager-level confirmation dialog (hoisted out of the tile so its `fixed` modal centers in the
      // viewport). The confirm button is therefore PAGE-level, not tile-scoped. Then confirm to destroy.
      await tile.getByTestId('desktop-delete').click();
      const confirm = page.getByTestId('desktop-delete-confirm');
      await expect(confirm, 'the delete-confirmation dialog should appear').toBeVisible({
        timeout: 5_000,
      });
      await confirm.click();
    });

    await test.step('5 · the tile disappears', async () => {
      await expect(tile).toHaveCount(0, { timeout: 15_000 });
    });

    await test.step('6 · REGRESSION: for ≥3 poll cycles the tile never reappears + the list drops the id', async () => {
      // THE tombstone guarantee. Hold the page alive across ≥3 list-poll cycles and sample often:
      // a stale/in-flight poll (one whose response still carried the just-deleted computer) would
      // reinsert the tile on one of these edges. The tombstone filters it out every reconcile, so
      // the tile must stay at count 0 the ENTIRE window — not merely "gone then back then gone".
      const samples = Math.ceil(WATCH_MS / SAMPLE_MS); // ~12 samples across ~6s (≥3× POLL_MS)
      for (let i = 0; i < samples; i++) {
        await expect(
          tile,
          `tile RESURRECTED at sample ${i + 1}/${samples} (~${(i + 1) * SAMPLE_MS}ms after delete) ` +
            `— a stale poll beat the tombstone`
        ).toHaveCount(0);
        await page.waitForTimeout(SAMPLE_MS);
      }

      // And the authoritative source agrees: the list GET no longer returns this id. (Poll it a few
      // times across another full cycle so a single lagging replica can't give a false positive.)
      await expect
        .poll(
          async () => {
            const res = await page.request.get('/api/v1/desktops');
            if (!res.ok()) return `list GET ${res.status()}`;
            const ids: string[] = (await res.json()).desktops.map((d: { id: string }) => d.id);
            return ids.includes(createdId) ? 'present' : 'absent';
          },
          { timeout: POLL_MS * 2, intervals: [500, 750, 1000] }
        )
        .toBe('absent');
    });

    await test.step('7 · hard reload — the server no longer has it, so the tile stays absent', async () => {
      await page.reload();
      // The login session is a cookie, so the authed manager comes straight back after reload.
      // If the gate ever shows, re-enter. Either way the New-computer button marks "app ready".
      if (!(await page.getByTestId('new-computer-button').first().isVisible({ timeout: 5_000 }).catch(() => false))) {
        await enterApp(page);
      }
      await expect(page.getByTestId('new-computer-button').first()).toBeVisible({ timeout: 15_000 });

      // Give the initial post-reload list poll room to land, then the tile must be absent and stay
      // absent across another couple of poll cycles (the server truly destroyed it).
      await expect(tile).toHaveCount(0, { timeout: 15_000 });
      const reloadSamples = Math.ceil((POLL_MS * 2) / SAMPLE_MS);
      for (let i = 0; i < reloadSamples; i++) {
        await expect(tile, `tile reappeared after reload at sample ${i + 1}`).toHaveCount(0);
        await page.waitForTimeout(SAMPLE_MS);
      }

      // Already deleted + confirmed gone on the server — nothing for afterEach to clean up.
      createdId = '';
    });

    expect(consoleErrors, `unexpected console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });
});
