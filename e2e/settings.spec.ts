/**
 * deskl.ink SETTINGS (live E2E) — the Settings modal + its one functional feature: a DEFAULT
 * new-computer distro + size that persists and pre-seeds the New-computer picker.
 *
 * Proves the real behavior end to end, HERMETICALLY (creates NO container — pure UI + localStorage):
 *   enterApp → account menu → Settings → set default size "Power" → Done → open the picker →
 *   the Power size is the pre-selected (aria-pressed) option → reload → reopen the picker →
 *   still Power (the choice survived the reload via localStorage['desklink:defaults']).
 *
 * Container-free, so it runs in the lean monitor. Testids mirror `@deskl/shared` desktopTestIds.
 *   DESKL_BASE_URL=https://deskl.ink DESKL_TEST_AUTH=<secret> pnpm -C e2e test settings
 */
import { test, expect, type Page } from '@playwright/test';
import { enterApp } from './auth.js';

const T = {
  newComputerButton: 'new-computer-button',
  accountMenuButton: 'account-menu-button',
  accountSettings: 'account-settings',
  settingsDialog: 'settings-dialog',
  settingsClose: 'settings-close',
  sizeOption: 'size-option', // the picker's size cards (carry data-size=<id>)
} as const;

const DEFAULTS_KEY = 'desklink:defaults';

/** A size card IN THE PICKER by its size id. */
function pickerSize(page: Page, size: string) {
  return page.locator(`[data-testid="${T.sizeOption}"][data-size="${size}"]`);
}

/** A default-size control IN THE SETTINGS MODAL by its size id. */
function settingsSize(page: Page, size: string) {
  return page.getByTestId(`settings-default-size-${size}`);
}

test.describe('Settings — default new computer', () => {
  test('set a default size → it persists + pre-seeds the New-computer picker', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && !/favicon|ResizeObserver|React DevTools/i.test(m.text())) {
        consoleErrors.push(m.text());
      }
    });

    await enterApp(page);

    // Start from a clean slate so the assertion is about THIS run, not a leftover preference.
    await page.evaluate((key) => window.localStorage.removeItem(key), DEFAULTS_KEY);

    await test.step('open Settings from the account menu', async () => {
      await page.getByTestId(T.accountMenuButton).click();
      const settingsItem = page.getByTestId(T.accountSettings);
      await expect(settingsItem).toBeVisible();
      // It sits above Sign out in the menu (the menuitem order the IA expects).
      await expect(page.getByRole('menuitem', { name: /settings/i })).toBeVisible();
      await settingsItem.click();
      await expect(page.getByTestId(T.settingsDialog)).toBeVisible();
    });

    await test.step('the account section shows the signed-in identity (read-only)', async () => {
      // The dev-login user is e2e@deskl.ink — surfaced read-only in the Account section.
      await expect(page.getByTestId(T.settingsDialog)).toContainText('@');
    });

    await test.step('choose "Power" as the default size', async () => {
      const power = settingsSize(page, 'power');
      await power.click();
      await expect(power).toHaveAttribute('aria-pressed', 'true');
      // The default is persisted immediately (Done only closes) — assert it landed in localStorage.
      const stored = await page.evaluate(
        (key) => window.localStorage.getItem(key),
        DEFAULTS_KEY
      );
      expect(stored ? (JSON.parse(stored) as { size?: string }).size : null).toBe('power');
      await page.getByTestId(T.settingsClose).click();
      await expect(page.getByTestId(T.settingsDialog)).toHaveCount(0);
    });

    await test.step('the New-computer picker opens pre-seeded on Power', async () => {
      await page.getByTestId(T.newComputerButton).click();
      const power = pickerSize(page, 'power');
      await expect(power).toBeVisible();
      await expect(power, 'Power is the pre-selected size').toHaveAttribute('aria-pressed', 'true');
      // And it is the ONLY active size (the default replaced Everyday, it didn't add to it).
      await expect(pickerSize(page, 'everyday')).toHaveAttribute('aria-pressed', 'false');
    });

    await test.step('the default survives a full reload', async () => {
      await page.reload();
      await expect(page.getByTestId(T.newComputerButton).first()).toBeVisible({ timeout: 15_000 });
      await page.getByTestId(T.newComputerButton).click();
      const power = pickerSize(page, 'power');
      await expect(power).toBeVisible();
      await expect(power, 'Power persisted across reload').toHaveAttribute('aria-pressed', 'true');
    });

    expect(consoleErrors, `unexpected console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });
});
