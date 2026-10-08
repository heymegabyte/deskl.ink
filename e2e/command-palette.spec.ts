/**
 * deskl.ink COMMAND PALETTE (⌘K) — live E2E
 *
 * The keyboard-driven command palette (spec §87): opens on ⌘K / Ctrl+K, filters computers + global
 * actions, runs the active one on Enter, closes on Escape. Container-free — the static actions
 * (New computer / Go Home / Sign out) need no desktop, so this is cheap, fast, and parallel-safe.
 * Also asserts the palette is axe-clean and that "New computer" actually opens the OS picker
 * (verifying the App→manager picker signal).
 *
 * ⌘K is deliberate — ⌘N/⌘W/⌘1-9 collide with real browser shortcuts. `ControlOrMeta` maps to ⌘ on
 * macOS and Ctrl elsewhere, matching the app's `metaKey || ctrlKey` handler.
 *
 * Run:  DESKL_BASE_URL=https://deskl.ink pnpm -C e2e test command-palette
 */
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const BENIGN_CONSOLE = /favicon|ResizeObserver|Download the React DevTools/i;

async function dismissOverlay(page: Page): Promise<void> {
  const close = page.getByTestId('overlay-close');
  if (await close.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await close.click();
  }
  await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0, {
    timeout: 10_000,
  });
}

test.describe('Command palette (⌘K)', () => {
  test('opens via ⌘K, filters, runs actions, axe-clean', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && !BENIGN_CONSOLE.test(m.text())) consoleErrors.push(m.text());
    });

    await page.goto('/');
    await dismissOverlay(page);

    const palette = page.getByTestId('command-palette');
    const input = page.getByTestId('command-input');

    await test.step('⌘K opens it + focuses the search field', async () => {
      await page.keyboard.press('ControlOrMeta+k');
      await expect(palette).toBeVisible();
      await expect(input).toBeFocused();
      // The three global actions are always present (no computers required).
      await expect(palette.locator('[data-command="new"]')).toBeVisible();
      await expect(palette.locator('[data-command="home"]')).toBeVisible();
      await expect(palette.locator('[data-command="signout"]')).toBeVisible();
    });

    await test.step('axe-clean while open', async () => {
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      expect(
        results.violations.map((v) => ({ id: v.id, impact: v.impact, target: v.nodes[0]?.target })),
        'command palette WCAG violations'
      ).toEqual([]);
    });

    await test.step('typing filters the list', async () => {
      await input.fill('sign');
      await expect(palette.locator('[data-command="signout"]')).toBeVisible();
      await expect(palette.locator('[data-command="home"]')).toHaveCount(0);
      await expect(palette.locator('[data-command="new"]')).toHaveCount(0);
    });

    await test.step('Escape closes it', async () => {
      await page.keyboard.press('Escape');
      await expect(palette).toBeHidden();
    });

    await test.step('"New computer" runs via Enter and opens the OS picker', async () => {
      await page.keyboard.press('ControlOrMeta+k');
      await expect(palette).toBeVisible();
      await input.fill('new computer');
      await page.keyboard.press('Enter');
      await expect(palette).toBeHidden();
      await expect(page.getByRole('dialog', { name: /choose your computer/i })).toBeVisible({
        timeout: 10_000,
      });
      await page.keyboard.press('Escape'); // close the picker
    });

    expect(consoleErrors, `console errors: ${consoleErrors.join('; ')}`).toEqual([]);
  });
});
