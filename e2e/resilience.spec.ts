/**
 * deskl.ink RESILIENCE + login gate (live E2E)
 *
 * - The top-level error boundary catches a render crash and shows a branded fallback (not React's
 *   blank white screen). Triggered by the gated `?__selftest=crash` self-test.
 * - The login gate shows until authenticated — no dismiss / no guest — with REAL, working sign-in
 *   affordances (Google + GitHub links, an email magic-link form).
 *
 * Container-free. Run:  DESKL_BASE_URL=https://deskl.ink pnpm -C e2e test resilience
 */
import { test, expect } from '@playwright/test';

test.describe('Resilience + login gate', () => {
  test('the error boundary catches a render crash and offers a reload', async ({ page }) => {
    await page.goto('/?__selftest=crash');
    await expect(page.getByTestId('error-boundary')).toBeVisible();
    await expect(page.getByRole('heading', { name: /something went wrong/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /reload/i })).toBeVisible();
  });

  test('login gate: shown with no dismiss; real Google/GitHub/email sign-in', async ({ page }) => {
    await page.goto('/');
    const gate = page.getByRole('dialog', { name: /welcome to deskl.ink/i });
    await expect(gate).toBeVisible();

    // No guest escape — the old dismiss "X" is gone.
    await expect(page.getByTestId('overlay-close')).toHaveCount(0);

    // Real, enabled sign-in affordances that actually go somewhere.
    await expect(page.getByTestId('auth-github')).toHaveAttribute('href', '/api/v1/auth/github');
    await expect(page.getByTestId('auth-google')).toHaveAttribute('href', '/api/v1/auth/google');
    await expect(page.getByTestId('auth-email')).toBeVisible();
    await expect(page.getByTestId('auth-email-submit')).toBeEnabled();
  });
});
