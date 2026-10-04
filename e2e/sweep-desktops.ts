/**
 * Destroy ALL desktops at the target — shared by the golden-loop global SETUP and
 * TEARDOWN so every run both STARTS and ENDS at zero. This makes the monitor immune to
 * concurrent-run leaks: a stray desktop from an overlapping fire can neither persist
 * (teardown) nor interfere with this run's `.first()` tile assertions (setup).
 *
 * Defaults to the live custom domain (matching playwright.config's prod-first baseURL) so
 * a monitor run that relies on the config default still sweeps deskl.ink, not localhost.
 *
 * Safe TODAY because there is no auth yet and every desktop is a test artifact.
 * TODO(M2-auth): scope to the test user's desktops once desktops belong to real users.
 */
export async function sweepDesktops(label: string): Promise<void> {
  const base = process.env['DESKL_BASE_URL'] ?? 'https://deskl.ink';
  try {
    const res = await fetch(`${base}/api/v1/desktops`);
    if (!res.ok) return;
    const { desktops } = (await res.json()) as { desktops: Array<{ id: string }> };
    await Promise.allSettled(
      desktops.map((d) => fetch(`${base}/api/v1/desktops/${d.id}`, { method: 'DELETE' }))
    );
    if (desktops.length > 0) {
      console.log(`[golden-path ${label}] destroyed ${desktops.length} desktop(s)`);
    }
  } catch {
    /* best-effort — never fail the suite on cleanup */
  }
}
