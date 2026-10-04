/**
 * Global teardown — destroy any leftover desktops so the golden-loop monitor never leaks
 * a running container. The golden-path test self-cleans its OWN desktop (delete step);
 * this catches STRAYS from overlapping / interrupted runs (the 15-min cron + manual fires
 * can race, and each test only deletes the id it created).
 *
 * Safe TODAY because there is no auth yet and every desktop is a test artifact.
 * TODO(M2-auth): once desktops belong to real users, scope this to the test user's
 * desktops only — NEVER sweep all — e.g. filter by an e2e-owned tag / the test session.
 */
import type { FullConfig } from '@playwright/test';

export default async function globalTeardown(_config: FullConfig): Promise<void> {
  const base = process.env['DESKL_BASE_URL'] ?? 'http://localhost:5173';
  try {
    const res = await fetch(`${base}/api/v1/desktops`);
    if (!res.ok) return;
    const { desktops } = (await res.json()) as { desktops: Array<{ id: string }> };
    await Promise.allSettled(
      desktops.map((d) => fetch(`${base}/api/v1/desktops/${d.id}`, { method: 'DELETE' }))
    );
    if (desktops.length > 0) {
      console.log(`[golden-path teardown] destroyed ${desktops.length} leftover desktop(s)`);
    }
  } catch {
    /* best-effort — never fail the suite on cleanup */
  }
}
