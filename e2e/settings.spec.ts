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
  settingsReduceMotion: 'settings-reduce-motion', // Appearance → "Reduce motion" switch
  sizeOption: 'size-option', // the picker's size cards (carry data-size=<id>)
} as const;

const DEFAULTS_KEY = 'desklink:defaults';
const REDUCE_MOTION_KEY = 'desklink:reduce-motion';

/** Open Settings from the account menu and wait for the dialog. */
async function openSettings(page: Page) {
  await page.getByTestId(T.accountMenuButton).click();
  await page.getByTestId(T.accountSettings).click();
  await expect(page.getByTestId(T.settingsDialog)).toBeVisible();
}

/** Read `<html data-reduce-motion>` as the browser sees it (empty string when cleared). */
function htmlReduceMotionAttr(page: Page) {
  return page.evaluate(() => document.documentElement.getAttribute('data-reduce-motion'));
}

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

  test('Appearance → "Reduce motion" toggles <html data-reduce-motion> + persists across reload', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && !/favicon|ResizeObserver|React DevTools/i.test(m.text())) {
        consoleErrors.push(m.text());
      }
    });

    await enterApp(page);

    // Clean slate so the assertion is about THIS run (default is off → attribute absent/empty).
    await page.evaluate((key) => window.localStorage.removeItem(key), REDUCE_MOTION_KEY);
    expect(await htmlReduceMotionAttr(page), 'starts off').toBeFalsy();

    await test.step('toggle Reduce motion ON → switch is checked + <html> flips live', async () => {
      await openSettings(page);
      const sw = page.getByTestId(T.settingsReduceMotion);
      await expect(sw).toHaveAttribute('role', 'switch');
      await expect(sw).toHaveAttribute('aria-checked', 'false');
      await sw.click();
      await expect(sw).toHaveAttribute('aria-checked', 'true');
      // The attribute is reflected onto the document root immediately (not on close).
      expect(await htmlReduceMotionAttr(page)).toBe('1');
      // And persisted to localStorage right away (there is no separate Save).
      const stored = await page.evaluate((key) => window.localStorage.getItem(key), REDUCE_MOTION_KEY);
      expect(stored).toBe('1');
      await page.getByTestId(T.settingsClose).click();
      await expect(page.getByTestId(T.settingsDialog)).toHaveCount(0);
    });

    await test.step('the preference survives a full reload (attribute re-applied on mount)', async () => {
      await page.reload();
      await expect(page.getByTestId(T.newComputerButton).first()).toBeVisible({ timeout: 15_000 });
      // App.tsx re-applies the saved pref on mount — the attribute is set before the modal is opened.
      expect(await htmlReduceMotionAttr(page), 'persisted across reload').toBe('1');
      // Reopen Settings: the switch reflects the persisted ON state.
      await openSettings(page);
      await expect(page.getByTestId(T.settingsReduceMotion)).toHaveAttribute('aria-checked', 'true');
    });

    await test.step('toggle OFF → switch unchecked + attribute cleared', async () => {
      const sw = page.getByTestId(T.settingsReduceMotion);
      await sw.click();
      await expect(sw).toHaveAttribute('aria-checked', 'false');
      // Cleared to empty string (falls back to the OS media query alone).
      expect(await htmlReduceMotionAttr(page), 'cleared when off').toBeFalsy();
      const stored = await page.evaluate((key) => window.localStorage.getItem(key), REDUCE_MOTION_KEY);
      expect(stored).toBe('0');
    });

    expect(consoleErrors, `unexpected console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
  });
});
