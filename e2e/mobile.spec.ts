/**
 * deskl.ink MOBILE (375px) — live E2E
 *
 * Guards the small-viewport layout the app had never been tested at: no horizontal overflow
 * (sideways-scroll bug) and axe-clean on the homepage overlay + manager, with the header's actions
 * still reachable (they collapse to icon-only on mobile so the wordmark isn't truncated).
 * Container-free. Run:  DESKL_BASE_URL=https://deskl.ink pnpm -C e2e test mobile
 */
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function dismissOverlay(page: Page): Promise<void> {
  const close = page.getByTestId('overlay-close');
  if (await close.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await close.click();
  }
  await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0, {
    timeout: 10_000,
  });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow, 'no horizontal overflow at 375px').toBeLessThanOrEqual(0);
}

test.describe('Mobile (375px)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('homepage overlay: no horizontal overflow + axe-clean', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('dialog', { name: /welcome to deskl.ink/i })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((v) => v.id), 'overlay WCAG @375').toEqual([]);
  });

  test('manager: no overflow + header fits (icon actions reachable) + axe-clean', async ({
    page,
  }) => {
    await page.goto('/');
    await dismissOverlay(page);
    await expectNoHorizontalOverflow(page);
    // The header's New-computer + Sign-out collapse to icon buttons but stay reachable.
    await expect(page.getByTestId('new-computer-button')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(results.violations.map((v) => v.id), 'manager WCAG @375').toEqual([]);
  });
});
