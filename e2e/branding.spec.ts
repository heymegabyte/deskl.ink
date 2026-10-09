import { test, expect } from '@playwright/test';
import { enterApp } from './auth.js';

/**
 * Visual-coverage regression for the official Linux distro branding (BRAND-1).
 * Opens the OS picker and captures the three authentic distro logos (Ubuntu /
 * Fedora / Debian). Doubles as the screenshot evidence for the convergence run.
 */
test('OS picker shows the three official distro logos', async ({ page }) => {
  await enterApp(page);

  // Open the create flow → OS picker dialog.
  await page.getByTestId('new-computer-button').click();
  const dialog = page.getByRole('dialog', { name: /choose your computer/i });
  await expect(dialog).toBeVisible();

  // All three distros are offered + visible.
  for (const distro of ['ubuntu', 'fedora', 'debian']) {
    await expect(page.getByTestId('distro-option').filter({ has: page.locator(`[data-distro="${distro}"]`) }).first()
      .or(page.locator(`[data-testid="distro-option"][data-distro="${distro}"]`))).toBeVisible();
  }

  await page.screenshot({ path: 'screenshots/branding/os-picker-distro-logos.png' });
});
