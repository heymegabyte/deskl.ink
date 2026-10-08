/**
 * deskl.ink SECURITY HEADERS — live E2E
 *
 * Guards the CSP reporting wiring: the document carries the Reporting-Endpoints header + the CSP's
 * report-to/report-uri directives, and the /api/v1/csp-report sink accepts a report (204, never
 * errors back at the browser). Container-free.
 *
 * Run:  DESKL_BASE_URL=https://deskl.ink pnpm -C e2e test security
 */
import { test, expect } from '@playwright/test';

test.describe('Security headers — CSP reporting', () => {
  test('document advertises a report endpoint + the sink accepts reports', async ({ page }) => {
    const res = await page.request.get('/');
    const headers = res.headers();

    const csp = headers['content-security-policy'] ?? '';
    expect(csp, 'CSP has report-to').toContain('report-to csp-endpoint');
    expect(csp, 'CSP has report-uri').toContain('report-uri /api/v1/csp-report');
    expect(headers['reporting-endpoints'] ?? '', 'Reporting-Endpoints header').toContain(
      'csp-endpoint'
    );

    // The sink accepts a (legacy-format) report and returns 204 — never fails the browser's POST.
    const report = await page.request.post('/api/v1/csp-report', {
      headers: { 'Content-Type': 'application/csp-report' },
      data: {
        'csp-report': {
          'document-uri': 'https://deskl.ink/',
          'violated-directive': 'script-src-elem',
          'blocked-uri': 'https://example.com/probe.js',
        },
      },
    });
    expect(report.status()).toBe(204);
  });
});
