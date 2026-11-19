/**
 * deskl.ink SEO / AI-search (GEO) — live E2E
 *
 * Guards the discovery layer: robots.txt / sitemap.xml / llms.txt must be REAL static files (not the
 * SPA's index.html fallback — the bug this slice fixed), and the homepage must carry a canonical URL
 * + valid SoftwareApplication/WebSite JSON-LD. Container-free.
 *
 * Run:  DESKL_BASE_URL=https://deskl.ink pnpm -C e2e test seo
 */
import { test, expect } from '@playwright/test';

test.describe('SEO / AI-search (GEO)', () => {
  test('robots.txt / sitemap.xml / llms.txt are real files, not the SPA fallback', async ({
    page,
  }) => {
    const robots = await page.request.get('/robots.txt');
    expect(robots.ok()).toBeTruthy();
    expect(robots.headers()['content-type'], 'robots is not HTML').not.toContain('text/html');
    const robotsBody = await robots.text();
    expect(robotsBody).not.toContain('<!doctype html>');
    expect(robotsBody).toContain('Sitemap: https://deskl.ink/sitemap.xml');
    expect(robotsBody).toContain('Disallow: /api/');

    const sitemap = await page.request.get('/sitemap.xml');
    expect(sitemap.ok()).toBeTruthy();
    expect(sitemap.headers()['content-type'], 'sitemap is not HTML').not.toContain('text/html');
    const sitemapBody = await sitemap.text();
    expect(sitemapBody).toContain('<loc>https://deskl.ink/</loc>');
    expect(sitemapBody).toContain('<urlset');

    const llms = await page.request.get('/llms.txt');
    expect(llms.ok()).toBeTruthy();
    expect(llms.headers()['content-type'], 'llms is not HTML').not.toContain('text/html');
    const llmsBody = await llms.text();
    expect(llmsBody).not.toContain('<!doctype html>');
    expect(llmsBody).toContain('# deskl.ink');

    const llmsFull = await page.request.get('/llms-full.txt');
    expect(llmsFull.ok()).toBeTruthy();
    expect(llmsFull.headers()['content-type'], 'llms-full is not HTML').not.toContain('text/html');
    const llmsFullBody = await llmsFull.text();
    expect(llmsFullBody).not.toContain('<!doctype html>');
    expect(llmsFullBody).toContain('# deskl.ink — Complete Knowledge Corpus');
  });

  test('homepage carries a canonical URL + valid SoftwareApplication/WebSite JSON-LD', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://deskl.ink/'
    );

    const ld = await page.locator('script[type="application/ld+json"]').textContent();
    expect(ld, 'JSON-LD present').toBeTruthy();
    const data = JSON.parse(ld as string);
    const types = (data['@graph'] as Array<{ '@type': string }>).map((n) => n['@type']);
    expect(types, 'has SoftwareApplication + WebSite').toEqual(
      expect.arrayContaining(['SoftwareApplication', 'WebSite'])
    );
  });
});
