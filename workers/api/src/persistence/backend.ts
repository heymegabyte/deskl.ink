/**
 * Compute-backend persistence gate — a PURE, dependency-free predicate (env flag only) so it is
 * unit-testable without the Workers runtime, unlike the route module that imports it (which pulls in
 * `@cloudflare/containers`). Mirrors the "pure core" factoring of `homeBackup.ts`.
 */

/**
 * Is durable `/home` persistence available on the ACTIVE compute backend?
 *
 * Durable persistence is hosted ONLY by the `DesktopContainer` fleet (its loopback backup service
 * streams the /home tar to/from R2). The universal `Computer` DO (`COMPUTER_DO=1`) does NOT yet host
 * that service, so when it is the live backend `persistenceFor` would resolve a SHADOW
 * `DesktopContainer` whose `/home` is empty while the real desktop runs elsewhere. Snapshotting that
 * shadow is useless; RESTORING it would overwrite nothing — or, if the shadow ever boots, race a live
 * `/home` — a latent DATA-LOSS the moment the flag flips (adversarial review 2026-10-09, finding 2a).
 *
 * So persistence is UNAVAILABLE under the flag: snapshot/restore return an HONEST `capability_gap`,
 * and stop/restart/delete fall back to a plain lifecycle op on the REAL backend (no checkpoint).
 * This guard may be removed ONLY once the backup service is ported to the `Computer` DO and
 * `persistenceFor` branches to it.
 */
export function persistenceAvailable(env: { COMPUTER_DO?: string }): boolean {
  return env.COMPUTER_DO !== '1';
}
