/**
 * Destroy ALL desktops at the target — shared by the golden-loop global SETUP and
 * TEARDOWN so every run both STARTS and ENDS at zero. This makes the monitor immune to
 * concurrent-run leaks: a stray desktop from an overlapping fire can neither persist
 * (teardown) nor interfere with this run's `.first()` tile assertions (setup).
 *
 * Defaults to the live custom domain (matching playwright.config's prod-first baseURL) so
 * a monitor run that relies on the config default still sweeps deskl.ink, not localhost.
 *
 * Ownership note: desktops now belong to a signed session principal, and list/DELETE are
 * owner-scoped — so the golden-path test is naturally isolated (its `page` principal only ever
 * sees its own computer) and this cross-run sweep is no longer required for correctness. It still
 * reaps ORPHANS (computers left by expired anonymous principals) when an operator token is present:
 * set `DESKL_ADMIN_TOKEN` (matching the Worker's `ADMIN_TOKEN`) and the sweep lists/deletes across
 * owners via `x-deskl-admin`. Without the token it harmlessly no-ops (sees only its own, empty, set).
 */
export async function sweepDesktops(label: string): Promise<void> {
  const base = process.env['DESKL_BASE_URL'] ?? 'https://deskl.ink';
  const adminToken = process.env['DESKL_ADMIN_TOKEN'];
  const headers: Record<string, string> = adminToken ? { 'x-deskl-admin': adminToken } : {};
  try {
    const res = await fetch(`${base}/api/v1/desktops`, { headers });
    if (!res.ok) return;
    const { desktops } = (await res.json()) as { desktops: Array<{ id: string }> };
    await Promise.allSettled(
      desktops.map((d) =>
        fetch(`${base}/api/v1/desktops/${d.id}`, { method: 'DELETE', headers })
      )
    );
    if (desktops.length > 0) {
      console.log(`[golden-path ${label}] destroyed ${desktops.length} desktop(s)`);
    }
  } catch {
    /* best-effort — never fail the suite on cleanup */
  }
}
