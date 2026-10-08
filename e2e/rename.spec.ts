/**
 * deskl.ink RENAME (live E2E)
 *
 * A real user journey for the rename feature: create a computer → rename it inline on its tile →
 * confirm the tile shows the new name → RELOAD and confirm it persisted (proving the server-side
 * PATCH, not just optimistic UI). Self-cleaning (deletes the computer it created), so it leaves the
 * fleet at zero like the golden path.
 *
 * Rename is metadata-only and works in any lifecycle state, so this doesn't wait for the container
 * to reach `ready` — it renames as soon as the tile appears, minimizing container runtime (§40).
 *
 * Run:  DESKL_BASE_URL=https://deskl.ink pnpm -C e2e test rename
 *
 * Testid values mirror `@deskl/shared` desktopTestIds.
 */
import { test, expect, type Page } from '@playwright/test';
import { enterApp } from './auth.js';

const BENIGN_CONSOLE = /favicon|ResizeObserver|Download the React DevTools/i;

/** Dismiss the first-run homepage overlay so the manager beneath is interactive. */
async function dismissOverlay(page: Page): Promise<void> {
  // The homepage is now the login GATE — authenticate (dev-login) to reach the app.
  await enterApp(page);
}

test.describe('Rename a computer', () => {
  let createdId = '';

  // Best-effort cleanup via the page's cookie jar (same signed principal that OWNS the computer).
  test.afterEach(async ({ page }) => {
    if (createdId) {
      await page.request.delete(`/api/v1/desktops/${createdId}`).catch(() => undefined);
    }
  });

  test('inline rename shows immediately AND persists across reload', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && !BENIGN_CONSOLE.test(m.text())) consoleErrors.push(m.text());
    });

    await test.step('create a computer + capture its id', async () => {
      await page.goto('/');
      await dismissOverlay(page);

      const createResp = page.waitForResponse(
        (r) => r.url().endsWith('/api/v1/desktops') && r.request().method() === 'POST'
      );
      await page.getByTestId('new-computer-button').first().click();
      await expect(page.getByRole('dialog', { name: /choose your computer/i })).toBeVisible();
      await page.getByTestId('create-computer-confirm').click();

      const resp = await createResp;
      expect(resp.ok()).toBeTruthy();
      createdId = (await resp.json()).desktop.id;
      expect(createdId, 'create returned a desktop id').toBeTruthy();
    });

    const tile = page.locator(`[data-testid="desktop-tile"][data-desktop-id="${createdId}"]`);
    const newName = `Renamed ${Date.now().toString(36)}`;

    await test.step('rename inline on the tile', async () => {
      await expect(tile).toBeVisible({ timeout: 15_000 });
      await tile.hover();
      await tile.getByTestId('desktop-rename').click();

      const input = tile.getByTestId('desktop-rename-input');
      await expect(input).toBeVisible();
      await input.fill(newName);
      await input.press('Enter');

      // The committed name shows immediately; the input is gone.
      await expect(tile.getByRole('heading', { level: 3 })).toHaveText(newName, { timeout: 10_000 });
      await expect(input).toHaveCount(0);

      // The outcome is announced to screen readers (WCAG 4.1.3 status message).
      await expect(page.getByTestId('status-announcer')).toContainText(newName);
    });

    await test.step('reload → the new name persisted server-side', async () => {
      await page.reload();
      await dismissOverlay(page);
      const reloaded = page.locator(`[data-testid="desktop-tile"][data-desktop-id="${createdId}"]`);
      await expect(reloaded.getByRole('heading', { level: 3 })).toHaveText(newName, {
        timeout: 15_000,
      });
    });

    expect(consoleErrors, `console errors: ${consoleErrors.join('; ')}`).toEqual([]);
  });
});
