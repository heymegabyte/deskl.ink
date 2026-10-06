/**
 * deskl.ink DISTRO PICKER (live E2E) — the gorgeous OS popup → each distro spins up.
 *
 * Proves the user-facing feature end to end: open the picker, SELECT a distro card
 * (Fedora, Debian), create, and confirm the MATCHING container boots to a real VNC
 * desktop — then delete. Ubuntu's default path is already covered by golden-path.spec.ts,
 * so this spec covers the NON-default distros.
 *
 * COST-GATED: each case cold-starts a real container (slow + billable), so the whole
 * describe is skipped unless DESKL_VERIFY_DISTROS=1. This keeps the 15-min monitor lean
 * (Ubuntu golden path only) while giving an on-demand full-matrix verification:
 *
 *   DESKL_VERIFY_DISTROS=1 pnpm -C e2e test distro-picker
 *
 * Testid values mirror `@deskl/shared` desktopTestIds.
 */
import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import path from 'path';

const T = {
  newComputerButton: 'new-computer-button',
  distroOption: 'distro-option',
  createConfirm: 'create-computer-confirm',
  tile: 'desktop-tile',
  tileStatus: 'desktop-status',
  openButton: 'desktop-open',
  deleteButton: 'desktop-delete',
  deleteConfirm: 'desktop-delete-confirm',
  vncViewport: 'vnc-viewport',
  controlSurface: 'desktop-control-surface',
  exitFullscreen: 'desktop-exit-fullscreen',
} as const;

const READY_TIMEOUT_MS = 150_000; // first-ever pull of a brand-new distro image is slow
const DESKTOP_PAINT_TIMEOUT_MS = 90_000;
const SHOT_DIR = path.join(import.meta.dirname, 'screenshots', 'golden-path');
const BENIGN_CONSOLE =
  /favicon|ResizeObserver|Download the React DevTools|package\.json|Failed to load resource: the server responded with a status of 404/i;

/** The non-default distros + the human-readable OS the API must report for each. */
const CASES = [
  { distro: 'fedora', os: /Fedora/i },
  { distro: 'debian', os: /Debian/i },
] as const;

async function dismissOverlay(page: Page): Promise<void> {
  const close = page.getByTestId('overlay-close');
  if (await close.isVisible({ timeout: 8_000 }).catch(() => false)) await close.click();
  await expect(page.locator('[role="dialog"][aria-modal="true"]')).toHaveCount(0, {
    timeout: 10_000,
  });
}

/**
 * Prove the desktop actually PAINTED over VNC — the <canvas> is already "visible" during
 * noVNC's blank "Connecting…" screen, so sample the framebuffer pixels (same-origin iframe)
 * and wait for real, non-uniform content before trusting the screenshot.
 */
async function waitForVncPaint(
  page: Page,
  viewportTestId: string,
  timeoutMs: number,
): Promise<void> {
  const canvas = page.frameLocator(`[data-testid="${viewportTestId}"]`).locator('canvas').first();
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(
      () =>
        canvas.evaluate((el) => {
          const c = el as HTMLCanvasElement;
          const ctx = c.getContext('2d');
          if (!ctx || !c.width || !c.height) return 0;
          let data: Uint8ClampedArray;
          try {
            data = ctx.getImageData(0, 0, c.width, c.height).data;
          } catch {
            return 0;
          }
          const colors = new Set<number>();
          const stride = Math.max(1, Math.floor(data.length / 4 / 2000)) * 4;
          for (let i = 0; i + 2 < data.length; i += stride) {
            colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
          }
          return colors.size;
        }),
      { timeout: timeoutMs, intervals: [1000, 1500, 2000, 3000] },
    )
    .toBeGreaterThan(4);
}

/** Best-effort wait for KDE's boot splash to clear into the themed desktop — keyed on the
 *  bottom PANEL appearing (full-width taskbar strip brightens; the splash leaves it near-black).
 *  A center-darkness check fires on the splash's small logo; the bottom strip is reliable.
 *  Capped; never fails the test. */
async function settleDesktop(page: Page, viewportTestId: string, maxMs: number): Promise<void> {
  const canvas = page.frameLocator(`[data-testid="${viewportTestId}"]`).locator('canvas').first();
  try {
    await expect
      .poll(
        () =>
          canvas.evaluate((el) => {
            const c = el as HTMLCanvasElement;
            const ctx = c.getContext('2d');
            if (!ctx || !c.width || !c.height) return 0;
            const sh = Math.max(1, Math.floor(c.height * 0.08));
            let data: Uint8ClampedArray;
            try {
              data = ctx.getImageData(0, c.height - sh, c.width, sh).data;
            } catch {
              return 0;
            }
            let sum = 0;
            let n = 0;
            const stride = Math.max(1, Math.floor(data.length / 4 / 3000)) * 4;
            for (let i = 0; i + 2 < data.length; i += stride) {
              sum += data[i] + data[i + 1] + data[i + 2];
              n += 3;
            }
            return n ? Math.round(sum / n) : 0;
          }),
        { timeout: maxMs, intervals: [2000, 2500, 3000, 3000] },
      )
      .toBeGreaterThan(16);
  } catch {
    /* panel didn't appear within the cap — screenshot anyway */
  }
}

/** Every desktop id currently rendered as a tile. */
async function tileIds(page: Page): Promise<string[]> {
  return page.getByTestId(T.tile).evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-desktop-id') ?? '').filter(Boolean),
  );
}

test.describe.serial('Distro picker', () => {
  // Cost gate — real containers. Opt in explicitly.
  test.skip(
    process.env['DESKL_VERIFY_DISTROS'] !== '1',
    'set DESKL_VERIFY_DISTROS=1 to run the billable multi-distro matrix',
  );

  let pickerShot = false;

  for (const { distro, os } of CASES) {
    test(`pick ${distro} → it spins up → VNC desktop → delete`, async ({ page, request }) => {
      const consoleErrors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error' && !BENIGN_CONSOLE.test(m.text())) consoleErrors.push(m.text());
      });

      let desktopId = '';
      try {
        await test.step('open the picker', async () => {
          await page.goto('/');
          await expect(page.locator('#root')).not.toBeEmpty();
          await dismissOverlay(page);
          await page.getByTestId(T.newComputerButton).click();
          // The picker is a modal dialog with one card per distro.
          await expect(page.getByTestId(T.distroOption).first()).toBeVisible({ timeout: 10_000 });
          if (!pickerShot) {
            await page.screenshot({ path: path.join(SHOT_DIR, '00-os-picker.png') });
            pickerShot = true;
          }
        });

        const before = await tileIds(page);

        await test.step(`select ${distro} + create`, async () => {
          const card = page.locator(
            `[data-testid="${T.distroOption}"][data-distro="${distro}"]`,
          );
          await card.click();
          await expect(card).toHaveAttribute('aria-pressed', 'true');
          await page.getByTestId(T.createConfirm).click();
        });

        await test.step('a NEW tile appears for the created desktop', async () => {
          await expect
            .poll(async () => (await tileIds(page)).filter((id) => !before.includes(id)).length, {
              timeout: 20_000,
            })
            .toBeGreaterThan(0);
          const fresh = (await tileIds(page)).filter((id) => !before.includes(id));
          desktopId = fresh[0] ?? '';
          expect(desktopId, 'a new desktop id must appear').toBeTruthy();
        });

        await test.step(`API reports distro=${distro}`, async () => {
          // Authoritative: the backend stored + routed to the chosen distro.
          const res = await (request as APIRequestContext).get(`/api/v1/desktops/${desktopId}`);
          expect(res.ok(), `GET desktop ${desktopId} ok`).toBeTruthy();
          // The API wraps the resource under `desktop` (POST also returns a sibling vncTicket).
          const body = (await res.json()) as { desktop?: { distro?: string; os?: string } };
          expect(body.desktop?.distro).toBe(distro);
          expect(body.desktop?.os ?? '').toMatch(os);
        });

        const tile = page.locator(
          `[data-testid="${T.tile}"][data-desktop-id="${desktopId}"]`,
        );

        await test.step('container reaches ready', async () => {
          await expect(tile).toHaveAttribute('data-distro', distro);
          await expect(tile.getByTestId(T.tileStatus)).toHaveAttribute('data-status', 'ready', {
            timeout: READY_TIMEOUT_MS,
          });
        });

        await test.step('open VNC + visually confirm the desktop renders', async () => {
          await tile.getByTestId(T.openButton).click();
          await expect(page.getByTestId(T.controlSurface)).toBeVisible({ timeout: 15_000 });
          // The viewport mounts after deskl.ink's branded "CONNECTED…" phase — generous wait.
          const viewport = page.getByTestId(T.vncViewport);
          await expect(viewport).toBeVisible({ timeout: 60_000 });
          // Wait for the framebuffer to actually paint (not just the canvas to exist)…
          await waitForVncPaint(page, T.vncViewport, DESKTOP_PAINT_TIMEOUT_MS);
          // …then let KDE's splash settle into the themed desktop for a truer screenshot.
          await settleDesktop(page, T.vncViewport, 60_000);
          await page.screenshot({ path: path.join(SHOT_DIR, `10-desktop-${distro}.png`) });
        });

        await test.step('delete', async () => {
          const exit = page.getByTestId(T.exitFullscreen);
          if (await exit.isVisible({ timeout: 5_000 }).catch(() => false)) await exit.click();
          await expect(tile).toBeVisible({ timeout: 10_000 });
          await tile.getByTestId(T.deleteButton).click();
          const confirm = page.getByTestId(T.deleteConfirm);
          if (await confirm.isVisible({ timeout: 3_000 }).catch(() => false)) await confirm.click();
          await expect(tile).toHaveCount(0, { timeout: 15_000 });
          // Verify the backend resource is actually destroyed (the tile is removed
          // optimistically before the DELETE round-trips) — the real "then destroyed" proof.
          await expect
            .poll(
              async () =>
                (await (request as APIRequestContext).get(`/api/v1/desktops/${desktopId}`)).status(),
              { timeout: 30_000 }, // CF container destroy is occasionally slow; tolerate it
            )
            .toBe(404);
          desktopId = '';
        });

        expect(consoleErrors, `unexpected console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
      } finally {
        // Never leak a container if an assertion bailed mid-flow.
        if (desktopId) {
          await (request as APIRequestContext)
            .delete(`/api/v1/desktops/${desktopId}`)
            .catch(() => undefined);
        }
      }
    });
  }
});
