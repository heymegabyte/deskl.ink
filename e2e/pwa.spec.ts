/**
 * deskl.ink PWA — manifest + install shortcut (live E2E)
 *
 * Locks in installability: a valid web app manifest (correct MIME, required fields, any+maskable
 * icons) and the "New computer" app shortcut (/?new=1 enters the app + opens the picker + strips
 * the param). Container-free — cheap, fast, parallel-safe.
 *
 * Run:  DESKL_BASE_URL=https://deskl.ink pnpm -C e2e test pwa
 */
import { test, expect } from '@playwright/test';
import { devLogin } from './auth.js';

test.describe('PWA — manifest + install shortcut', () => {
  test('manifest is linked, valid, and correctly served', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      'href',
      '/manifest.webmanifest'
    );

    const res = await page.request.get('/manifest.webmanifest');
    expect(res.ok()).toBeTruthy();
    expect(res.headers()['content-type']).toContain('application/manifest+json');

    const m = await res.json();
    expect(m.name, 'name').toBeTruthy();
    expect(m.start_url, 'start_url').toBe('/');
    expect(m.display, 'display').toBe('standalone');
    // Installability: an icon set covering both the 'any' and 'maskable' purposes.
    expect(m.icons.some((i: { purpose?: string }) => (i.purpose ?? 'any').includes('any'))).toBeTruthy();
    expect(m.icons.some((i: { purpose?: string }) => (i.purpose ?? '').includes('maskable'))).toBeTruthy();
    // The declared icons actually resolve (200).
    for (const icon of m.icons as Array<{ src: string }>) {
      const r = await page.request.get(icon.src);
      expect(r.ok(), `icon ${icon.src}`).toBeTruthy();
    }
  });

  test('"New computer" shortcut (/?new=1) opens the picker + strips the param (authenticated)', async ({
    page,
  }) => {
    await devLogin(page.request); // the shortcut only applies inside the app
    await page.goto('/?new=1');
    await expect(page.getByRole('dialog', { name: /choose your computer/i })).toBeVisible({
      timeout: 10_000,
    });
    // The query param has been cleaned so a reload doesn't re-trigger it.
    expect(new URL(page.url()).search, 'query stripped').toBe('');
  });
});
