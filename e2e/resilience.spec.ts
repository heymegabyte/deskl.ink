/**
 * deskl.ink RESILIENCE + honest auth (live E2E)
 *
 * - The top-level error boundary catches a render crash and shows a branded fallback (not React's
 *   blank white screen). Triggered by the gated `?__selftest=crash` self-test.
 * - The home overlay's auth panel has a WORKING primary ("Start now" → enters the workspace) and
 *   marks account sign-in as coming-soon (disabled) — no dead no-op buttons.
 *
 * Container-free. Run:  DESKL_BASE_URL=https://deskl.ink pnpm -C e2e test resilience
 */
import { test, expect } from '@playwright/test';

test.describe('Resilience + honest auth', () => {
  test('the error boundary catches a render crash and offers a reload', async ({ page }) => {
    await page.goto('/?__selftest=crash');
    await expect(page.getByTestId('error-boundary')).toBeVisible();
    await expect(page.getByRole('heading', { name: /something went wrong/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /reload/i })).toBeVisible();
  });

  test('auth panel: "Start now" enters the app; OAuth is coming-soon (disabled, not a dead no-op)', async ({
    page,
  }) => {
    await page.goto('/');
    const overlay = page.getByRole('dialog', { name: /welcome to deskl.ink/i });
    await expect(overlay).toBeVisible();

    // Account options are explicitly not-yet-active — disabled, so they never "do nothing" on click.
    await expect(page.getByRole('button', { name: /continue with github/i })).toBeDisabled();
    await expect(page.getByRole('button', { name: /continue with google/i })).toBeDisabled();

    // The honest primary works: it enters the workspace (anonymous session).
    await page.getByTestId('auth-start').click();
    await expect(overlay).toHaveCount(0);
  });
});
