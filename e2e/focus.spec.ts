/**
 * deskl.ink MODAL FOCUS MANAGEMENT (live E2E)
 *
 * The ARIA dialog pattern that the static axe scan can't verify: opening a modal moves focus into
 * it, Tab is contained within it, and closing restores focus to the element that opened it. Covers
 * the OS picker + the ⌘K command palette. Container-free.
 *
 * Run:  DESKL_BASE_URL=https://deskl.ink pnpm -C e2e test focus
 */
import { test, expect, type Page } from '@playwright/test';
import { enterApp } from './auth.js';

async function dismissOverlay(page: Page): Promise<void> {
  // The homepage is now the login GATE — authenticate (dev-login) to reach the app.
  await enterApp(page);
}

/** Is the active element inside the OS-picker dialog? (runs in the browser) */
const focusInPicker = () => {
  const d = document.querySelector('[role="dialog"][aria-label="Choose your computer"]');
  return !!d && d.contains(document.activeElement);
};

test.describe('Modal focus management', () => {
  test('OS picker: focus moves in, Tab is contained, and restores to the opener on close', async ({
    page,
  }) => {
    await page.goto('/');
    await dismissOverlay(page);

    const newBtn = page.getByTestId('new-computer-button');
    await newBtn.click(); // click focuses the opener
    const picker = page.getByRole('dialog', { name: /choose your computer/i });
    await expect(picker).toBeVisible();

    // Focus moved into the dialog.
    await expect.poll(() => page.evaluate(focusInPicker)).toBeTruthy();

    // Tabbing stays inside the dialog (containment).
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(focusInPicker), 'Tab stayed within the dialog').toBeTruthy();

    // Esc closes + restores focus to the opener.
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
    await expect(newBtn).toBeFocused();
  });

  test('command palette: focus moves to the input + restores to the opener on close', async ({
    page,
  }) => {
    await page.goto('/');
    await dismissOverlay(page);

    const newBtn = page.getByTestId('new-computer-button');
    await newBtn.focus();
    await page.keyboard.press('ControlOrMeta+k');

    const palette = page.getByTestId('command-palette');
    await expect(palette).toBeVisible();
    await expect(page.getByTestId('command-input')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden();
    await expect(newBtn).toBeFocused();
  });
});
