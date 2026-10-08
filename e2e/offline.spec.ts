/**
 * deskl.ink OFFLINE (service worker) — live E2E
 *
 * Proves the installable PWA works offline: with the service worker active, going offline and
 * reloading still renders the app shell (from the SW cache) instead of the browser's error page.
 * Container-free. The control-plane safety of the SW (never caching /api/*) is covered transitively
 * by the golden path staying green with the SW active.
 *
 * Run:  DESKL_BASE_URL=https://deskl.ink pnpm -C e2e test offline
 */
import { test, expect } from '@playwright/test';

test.describe('PWA offline (service worker)', () => {
  test('the shell loads from cache when offline', async ({ page, context }) => {
    // Warm the cache + register/activate the SW.
    await page.goto('/');
    await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, {
      timeout: 20_000,
    });
    // One more online navigation so the network-first handler caches the shell.
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /a desktop for you/i })).toBeVisible();

    // Go offline and reload — the SW must serve the cached shell, not a browser error page.
    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page.locator('#root')).not.toBeEmpty({ timeout: 10_000 });
      // The real app shell booted offline (static hero copy needs no /api).
      await expect(page.getByRole('heading', { name: /a desktop for you/i })).toBeVisible({
        timeout: 10_000,
      });
    } finally {
      await context.setOffline(false);
    }
  });
});
