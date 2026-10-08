/**
 * deskl.ink ACCESSIBILITY GATE (live axe-core E2E)
 *
 * Converts the one-time §117 a11y sweep into a PERMANENT regression gate. Audits the three
 * container-free primary surfaces — the first-run homepage overlay, the desktop manager, and
 * the OS picker — against WCAG 2.0/2.1/2.2 Level A + AA and asserts ZERO violations.
 *
 * Deliberately container-free: creates no desktop, so it's cheap, fast, parallel-safe, and
 * independent of the (paid, stateful) golden path. Run just this suite with:
 *   DESKL_BASE_URL=https://deskl.ink pnpm -C e2e test:a11y
 *
 * CSP note: the prod SPA now serves an enforcing `script-src 'self'` (D13), which refuses
 * CDN <script> injection. @axe-core/playwright injects axe via page.evaluate (CDP), which is
 * NOT governed by page CSP — so this is the correct, CSP-compatible way to run axe here.
 *
 * Testid values mirror `@deskl/shared` desktopTestIds.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { enterApp } from './auth.js';

/** The WCAG rule sets we hold the product to (matches the manual sweep). */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Run axe over the whole document and return only the WCAG A/AA violations. */
async function auditWcag(page: Page) {
  return new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
}

/** Compact, readable summary so a CI failure says WHAT broke, not a wall of JSON. */
function summarize(violations: Awaited<ReturnType<typeof auditWcag>>['violations']) {
  return violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.length,
    help: v.help,
    target: v.nodes[0]?.target?.join(' '),
  }));
}

/** Dismiss the first-run homepage overlay so the manager beneath is interactive. */
async function dismissOverlay(page: Page): Promise<void> {
  // The homepage is now the login GATE — authenticate (dev-login) to reach the app.
  await enterApp(page);
}

test.describe('Accessibility (axe) — WCAG 2.2 A+AA, container-free surfaces', () => {
  test('homepage (first-run overlay) has no WCAG A/AA violations', async ({ page }) => {
    await page.goto('/');
    // The overlay is the real first-paint surface — wait for it before auditing.
    await expect(page.locator('[role="dialog"][aria-modal="true"]')).toBeVisible({
      timeout: 15_000,
    });
    const results = await auditWcag(page);
    expect(summarize(results.violations), 'homepage overlay WCAG violations').toEqual([]);
  });

  test('desktop manager has no WCAG A/AA violations', async ({ page }) => {
    await page.goto('/');
    await dismissOverlay(page);
    // The manager shell (its sr-only <h1> + header) is now the live surface.
    await expect(page.getByTestId('new-computer-button').first()).toBeVisible({ timeout: 10_000 });
    const results = await auditWcag(page);
    expect(summarize(results.violations), 'manager WCAG violations').toEqual([]);
  });

  test('OS picker dialog has no WCAG A/AA violations', async ({ page }) => {
    await page.goto('/');
    await dismissOverlay(page);
    await page.getByTestId('new-computer-button').first().click();
    // The picker is a labelled dialog ("Choose your computer").
    await expect(page.getByRole('dialog', { name: /choose your computer/i })).toBeVisible({
      timeout: 10_000,
    });
    const results = await auditWcag(page);
    expect(summarize(results.violations), 'OS picker WCAG violations').toEqual([]);
  });
});
