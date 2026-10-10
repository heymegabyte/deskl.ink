/**
 * deskl.ink RENAME — ZERO LAYOUT SHIFT (live E2E)
 *
 * P0 regression guard: entering inline-rename mode must NOT move or resize the tile's name. We
 * measure the view-mode <h3>'s box + computed type BEFORE editing, enter edit mode, then measure the
 * <input>'s box + computed type AFTER — and assert the geometry matches (±1px box; identical
 * font-family / size / weight / letter-spacing / line-height). This locks the fix where the input
 * shares the title's typography and resets its own box chrome (no border/padding that would shift
 * surrounding layout).
 *
 * Self-cleaning (deletes the computer it creates) so the fleet ends at zero, like the golden path.
 * Rename is metadata-only, so this doesn't wait for the container to reach `ready`.
 *
 * Run:  DESKL_BASE_URL=https://deskl.ink DESKL_TEST_AUTH=<secret> pnpm -C e2e test rename-no-shift
 *
 * Testid values mirror `@deskl/shared` desktopTestIds.
 */
import { test, expect, type Locator } from '@playwright/test';
import { enterApp } from './auth.js';

const BENIGN_CONSOLE = /favicon|ResizeObserver|Download the React DevTools/i;

/** The geometry + type properties that must be identical across view ↔ edit to avoid any shift. */
interface NameMetrics {
  top: number;
  left: number;
  height: number;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  letterSpacing: string;
  lineHeight: string;
}

/** Read an element's bounding box + the computed type properties the fix pins together. */
async function readMetrics(el: Locator): Promise<NameMetrics> {
  return el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    const cs = getComputedStyle(node);
    return {
      top: r.top,
      left: r.left,
      height: r.height,
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      letterSpacing: cs.letterSpacing,
      lineHeight: cs.lineHeight,
    };
  });
}

test.describe('Inline rename — zero layout shift', () => {
  let createdId = '';

  test.afterEach(async ({ page }) => {
    if (createdId) {
      await page.request.delete(`/api/v1/desktops/${createdId}`).catch(() => undefined);
    }
  });

  test('the rename input matches the title geometry (no shift entering edit mode)', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && !BENIGN_CONSOLE.test(m.text())) consoleErrors.push(m.text());
    });

    await test.step('create a computer + capture its id', async () => {
      await page.goto('/');
      await enterApp(page);

      const createResp = page.waitForResponse(
        (r) => r.url().endsWith('/api/v1/desktops') && r.request().method() === 'POST'
      );
      await page.getByTestId('new-computer-button').first().click();
      await expect(page.getByRole('dialog', { name: /choose your computer/i })).toBeVisible();
      await page.getByTestId('create-computer-confirm').click();

      const resp = await createResp;
      expect(resp.ok()).toBeTruthy();
      createdId = (await resp.json()).desktop.id;
      expect(createdId, 'create returned a desktop id').toBeTruthy();
    });

    const tile = page.locator(`[data-testid="desktop-tile"][data-desktop-id="${createdId}"]`);
    await expect(tile).toBeVisible({ timeout: 15_000 });

    // BEFORE: measure the view-mode title.
    const title = tile.getByRole('heading', { level: 3 });
    await expect(title).toBeVisible();
    const before = await readMetrics(title);

    // Enter edit mode (the pencil reveals on hover).
    await tile.hover();
    await tile.getByTestId('desktop-rename').click();
    const input = tile.getByTestId('desktop-rename-input');
    await expect(input).toBeVisible();

    // AFTER: measure the edit-mode input.
    const after = await readMetrics(input);

    // Box geometry: identical within 1px (the whole point of the fix).
    expect(Math.abs(after.top - before.top), `top shift: ${before.top} → ${after.top}`).toBeLessThanOrEqual(1);
    expect(Math.abs(after.left - before.left), `left shift: ${before.left} → ${after.left}`).toBeLessThanOrEqual(1);
    expect(
      Math.abs(after.height - before.height),
      `height shift: ${before.height} → ${after.height}`
    ).toBeLessThanOrEqual(1);

    // Type geometry: pixel-identical (shared NAME_TYPOGRAPHY + font: inherit).
    expect(after.fontFamily, 'font-family').toBe(before.fontFamily);
    expect(after.fontSize, 'font-size').toBe(before.fontSize);
    expect(after.fontWeight, 'font-weight').toBe(before.fontWeight);
    expect(after.letterSpacing, 'letter-spacing').toBe(before.letterSpacing);
    expect(after.lineHeight, 'line-height').toBe(before.lineHeight);

    // Escape cancels cleanly and restores the title at the SAME geometry (no residual shift).
    await input.press('Escape');
    await expect(input).toHaveCount(0);
    const restored = await readMetrics(tile.getByRole('heading', { level: 3 }));
    expect(Math.abs(restored.top - before.top), 'title top after cancel').toBeLessThanOrEqual(1);
    expect(Math.abs(restored.height - before.height), 'title height after cancel').toBeLessThanOrEqual(
      1
    );

    expect(consoleErrors, `console errors: ${consoleErrors.join('; ')}`).toEqual([]);
  });
});
