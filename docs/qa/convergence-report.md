# Convergence Report — DeskLink `/run-the-loop` session (2026-10-10)

> Readable summary of the autonomous convergence session. **Per-iteration detail + receipts live in
> `.claude/run-the-loop/CONVERGENCE.md`** (the SSOT); this is the digest. Golden-Path coverage:
> `docs/qa/golden-paths.md`. Restore-on-boot design: `docs/architecture/compute-and-persistence.md`.

## What converged (shipped + verified live on `deskl.ink`)

**The 3 immediate P0s — done + live-E2E-verified:**
1. **Deletion flicker** → authoritative client tombstone (delete tombstones before optimistic removal;
   every list reconcile filters it → no stale/in-flight poll can resurrect). `delete-no-resurrect.spec`.
2. **Generic names → codenames** → curated owner-unique vocabulary (`compute/codename.ts`, 8 unit tests);
   live create → "Amber"/"Fern"/… not "Everyday Desktop". `defaultName` retired.
3. **Inline-edit geometry** → input overlays the `<h3>` as `absolute inset-0`, h3 className constant →
   zero shift; `rename-no-shift.spec` GREEN ≤1px. (The chased "2px" was a hover-lift test artifact.)

**Persistence (PERSIST-1a) — snapshot proven on real infra:** DO streams the agent's `/home` tar to R2
via **multipart** (R2 rejects length-unknown `put`), integrity-gated, checkpoint-before-stop; on-demand
"Back up now" + a persisted "Backed up <time>" indicator. ~1 MB real tars verified ×5+.

**Lifecycle + UX:** Restart wired end-to-end (real checkpoint+stop+start); stable action row through
transients; visible success toast (zero layout shift); account menu (identity + sign-out); rich centered
delete confirmation; cost transparency in the creation picker; Settings (account + default-computer prefs
+ reduce-motion). All owner-scoped, a11y-clean, mobile-safe.

**Security:** server-enforced default-deny + owner-scoped authz across every per-`:id` route
(incl. snapshot/restore/restart); cross-user IDOR → 404; VNC/term HMAC-ticketed; Zod at every boundary.

## Evidence
- `pnpm -r typecheck` clean · `pnpm -C workers/api test` **51/51** · `pnpm -C apps/web build` green.
- Deployed to prod each slice; **prod E2E sweep 20/20 green** (a11y/authz/backup/branding/command-palette/
  focus/mobile/offline/pwa/security/seo).
- **Three independent clean review passes** (frontend lens, backend/security lens, iter-13–16 regression),
  each 0 P0 / 0 P1 — satisfying the protocol's "two consecutive clean passes" for the shipped body.

## Verdict
The shipped surface — the 3 immediate P0s + lifecycle + snapshot + the UX/Settings/cost/auth work —
**CONVERGES** by the protocol's observable exit criteria (zero unresolved P0 in it, acceptance by fresh
live evidence, required tests pass, no known vuln, core journeys green, ≥2 clean passes).

## Not converged (honest remaining frontier)
- **PERSIST-1b restore-on-boot (P0)** — the restore half of Golden Path G. Can't untar a live `/home`;
  needs restore-on-boot (DESIGNED: `docs/architecture/compute-and-persistence.md`). Touches the container
  boot path + needs a novel ttyd-driven sentinel E2E → **fresh-session slice.**
- **New product scope** (not regressions): orgs/teams (C/H org-half), Stripe billing + usage ledger (E),
  real agent tool-exec / ACP-EXEC (F), plus files/connections/notifications/recording/templates — each a
  fresh focused slice, several security- or architecture-sensitive.
- Tracked P2: `DesktopRegistry` global singleton (owner-column isolation today; DO-partition = TODO(M2)).

**Bottom line:** the loop converged everything safely achievable from one session; the highest-value
remaining item (restore-on-boot) is designed and ready for a fresh session.
