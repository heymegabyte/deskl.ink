# CONVERGENCE — deskl.ink (persistent progress record)

> Resumable memory of the `/run-the-loop` convergence protocol. Receipts, not prose.
> Protocol: `./CONVERGENCE-PROTOCOL.md`. Resume from here.

## Status
- **Converged:** PARTIAL — iteration 1 slices (BRAND-1, AUTH-1, ACP-1/2/3) converged + prod-verified; iteration 2 landed **PERSIST-1** (the biggest open P0) + **LIFE-1** (P1) — code-complete, unit-verified (41/41), independently reviewed (0 P0), and DEPLOYED to prod. PERSIST-1 is NOT yet claimed fully converged: the end-to-end live sentinel round-trip (real container destroy+recreate) + auto-restore-on-boot are the remaining acceptance gaps (tracked below). Honest, not a false "fully converged".
- **Current iteration:** 2 — Stage B (impl) + C (independent review pass 1: 0 P0 / 1 P1 fixed / 3 P2) done; review pass 2 (confirm the P1 guard + no new issue) pending to claim the PERSIST-1 two-clean-pass rule.
- **Budget:** 2 sessions. Default budgets now explicit in CONVERGENCE-PROTOCOL (≤3 Stage-A passes · ≤5 A→B→C iters · ≤6 mutating agents · 2-no-delta breaker). Next fire: live PERSIST-1 E2E + auto-restore-on-boot + ACP-EXEC daemon + the P2s.
- **Prod version:** `98ae02ed` (iteration-2 worker + P1-guard; rebuilt Ubuntu image incl. backup-agent, bucket `deskl-ink-backups` bound) · health 200 · **Last updated:** 2026-10-10 (iteration 2)

## Requirements + acceptance criteria
| id | pri | requirement | acceptance criterion | status | evidence |
|----|-----|-------------|----------------------|--------|----------|
| AUTH-1 | P0 | Authz regression tests (default-deny + IDOR) | e2e asserts 401 on every control-plane endpoint w/o session; cross-user GET → 404; vnc/term w/o ticket → 401 | **done** | e2e/authz.spec.ts — 4/4 green on PROD |
| BRAND-1 | P0 | Official Linux logos (Ubuntu/Fedora/Debian), accessible | shared `<DistroLogo>` renders authentic marks; decorative-by-default (no SR double-announce), labelled icon-only; picker/tiles/tabs; screenshot crisp | **done** | DistroLogo.tsx; screenshot os-picker-distro-logos.png; OS-picker a11y axe-clean |
| ACP-1 | P0 | DO SessionCoordinator: participants + controlHolder + handoff (#2,#3), server-bound identity | unit tests: multi-participant; non-holder/cross-principal mutating → denied; requestControl/handoff transfers; auto-promote → null not viewer | **done** | SessionCoordinatorState.ts; 22/22 vitest |
| ACP-2 | P0 | Typed control-plane contracts (participant, control msgs, MCP tools #1) | Zod schemas in packages/shared; infer types; validate round-trip; rehydrate safeParse | **done** | packages/shared/control-plane.ts |
| ACP-3 | P0 | Authenticated MCP tools endpoint (#1), flag-gated, principal-bound | `/:id/mcp` 404 when flag off, 401 w/o auth, owner-scoped 404; server-minted connId; honest capability_gap | **done** | routes/mcp.ts; authz test 4 green on PROD |
| PERSIST-1 | P0 | R2 durable persistence surviving container replacement | sentinel file survives destroy+recreate (restore from R2) | **impl+deployed; live-E2E pending** | homeBackup.ts + backup-agent.py + BACKUPS bound; 23 unit tests; prod v944b2340. GAP: live sentinel round-trip + auto-restore-on-boot (restore is manual today) — see gaps |
| LIFE-1 | P1 | `POST /:id/restart` verb (atomic stop→start) | idempotent; returns ready desktop; owner-scoped | **done** | routes/desktops.ts `/:id/restart` — checkpoint→stop→start, owner-scoped (401/404), typed response; deployed |
| ACP-EXEC | P1 | Container command daemon (real click/screenshot/run_shell) | tool call → container daemon → effect visible in next screenshot | deferred | CAPABILITY GAP — needs container-side daemon |
| REVOKE-1 | P1 | Server-side session revocation | logout invalidates token server-side (old cookie → 401) | deferred | needs a store (DO/D1) |

## Implemented changes

### Iteration 2 (2026-10-09) — PERSIST-1 + LIFE-1
- **PERSIST-1** (P0, commit `4a9d9400`) — durable `/home` persistence surviving container REPLACEMENT.
  - `container/ubuntu/backup-agent.py` (new) — loopback tar service `0.0.0.0:7070` (NOT in EXPOSE, DO-only, same posture as ttyd); streams `tar -czf -` for `/backup`, pipes `/restore` into `tar -xzf` with `--no-same-owner --no-same-permissions` (untrusted R2 tar); single-flight lock (OOM/DoS guard). Wired in `start.sh` (backgrounded, non-fatal) + `Dockerfile` (python3 + copy + chmod).
  - `workers/api/src/persistence/homeBackup.ts` (new) — PURE injectable core: `snapshotHome`/`restoreHome` + honest `capability_gap`/`error` typing, unique keys (no same-ms collision), newest-N retention, **gzip integrity gate** (never advance `latest.json` to a corrupt archive), `duplex:'half'` streaming restore.
  - `workers/api/src/containers/DesktopContainer.ts` — thin DO adapter (`snapshotHome`/`restoreHome`/`stopWithCheckpoint`); checkpoint resolves BEFORE stop (never "stopped" before durable).
  - `workers/api/src/routes/desktops.ts` — `POST /:id/snapshot` · `/:id/restore` (plain-stop→restore→always-restart; never untars into a live `/home`) · `/:id/stop` now checkpoints (status `persisting`) · `DELETE` best-effort pre-destroy snapshot. All owner-scoped (401/404 non-leak).
  - `packages/shared/src/persistence.ts` (new) — Zod contracts (Snapshot/Restore/StopWithCheckpoint results).
  - `workers/api/wrangler.toml` — `BACKUPS` R2 binding LIVE (bucket `deskl-ink-backups` verified present).
- **LIFE-1** (P1, commit `4a9d9400`) — `POST /:id/restart` (checkpoint→stop→start, owner-scoped, typed).
- **P1-2a guard** (commit after review) — `workers/api/src/persistence/backend.ts` (new) `persistenceAvailable(env)`: under `COMPUTER_DO=1` snapshot/restore return honest `capability_gap` + stop/restart/delete fall back to a plain lifecycle op on the REAL backend (closes the flag-flip data-loss the review found).

### Iteration 1
- **BRAND-1** — `apps/web/src/components/DistroLogo.tsx` (new, authentic Ubuntu/Fedora/Debian SVG marks, decorative-by-default + labelled icon-only); wired into OsPicker/DesktopTile/TabStrip/CommandPalette; `DistroMark.tsx` deleted (dead).
- **AUTH-1** — `e2e/authz.spec.ts` (new, 4 tests); `/dev-login` gained optional `{email}` (test-gated) + `e2e/auth.ts` helper param, so IDOR tests mint distinct users.
- **ACP-1/2/3** (#1/#2/#3 foundation, flag `AGENT_CONTROL_PLANE` default-OFF) — `packages/shared/src/control-plane.ts` (Zod contracts); `workers/api/src/control/SessionCoordinatorState.ts` (pure arbiter, server-bound principal); DO coordinator RPC in `DesktopContainer.ts` (Zod-validated rehydrate, honest `capability_gap`); `routes/mcp.ts` (new, flag→404/auth→401/owner→404); `env.ts` flag; vitest introduced (`vitest.config.ts` + 22 tests).

## Tests + evidence (receipts, not claims)
### Iteration 2
- `pnpm -r typecheck` → clean. `pnpm -C workers/api test` → **41/41** (23 persistence + 2 backend-gate added this iter; 16 prior). 
- Deploy: `wrangler deploy` (global-key creds; scoped token lacks R2 perm) → prod **v944b2340**, container application changes applied (Ubuntu image rebuilt incl. `backup-agent.py`), exit 0, no warnings. R2 bucket `deskl-ink-backups` confirmed present (`wrangler r2 bucket list`).
- Prod routes: unauth `POST /api/v1/desktops/<id>/{restart,snapshot}` → **401** via default-deny middleware (AUTH-1 still holds — never reaches route resolution). Full authenticated destroy+recreate sentinel E2E = the remaining live gap (below).
- Independent adversarial review (fresh agent, "break it not bless it"): **0 P0, 1 P1 (fixed), 3 P2** — would not block release.

### Iteration 1
- `pnpm -r typecheck` → clean. `pnpm -C workers/api test` → **22/22**. `pnpm -C apps/web build` → green.
- PROD (`deskl.ink`, v1bc25c9f): `e2e/authz.spec.ts` **4/4** (default-deny 401s, vnc/term 401, IDOR 404, mcp-gate). Full suite **23 passed / 2 skipped** incl. golden-path create→VNC→delete (36.5s) + OS-picker a11y axe-clean → no regression.
- Visual: `e2e/screenshots/branding/os-picker-distro-logos.png` — inspected: authentic marks, crisp, consistent.

## Bugs discovered → fixed
- **P1 (iter-2 review 2a):** under `COMPUTER_DO=1`, persistence routes targeted a SHADOW `DesktopContainer` while the live desktop runs on the `Computer` DO → restore would untar into the wrong/empty `/home` (latent DATA-LOSS on flag flip). → FIXED: `persistenceAvailable(env)` gate (`persistence/backend.ts`, 2 unit tests) — honest `capability_gap` for snapshot/restore + plain-lifecycle fallback for stop/restart/delete under the flag. Flag OFF today ⇒ zero live behavior change. Re-review (pass 2) pending to confirm.
- **P0 (iter-1 review pass 1):** control plane authorized against client-supplied connId/role (no principal binding) → FIXED: server-minted connId + `principal===auth.id` on every scoped op; role server-derived. Guarding tests added (cross-principal → denied). Confirmed closed in pass 2.
- **P1:** storage rehydrate bypassed Zod → `SessionSnapshotSchema.safeParse`. Roster unwired → `control/join`+`leave`. DistroLogo SR double-announce → decorative-by-default. Dead `DistroMark` → deleted.

## Recommendations adopted / deferred
- Adopted: branding uses official marks (orbs were stylized, not the logos the P0 requires); control-plane built on the DO as the single arbiter (integrates #1/#2/#3 coherently); flag-gate `AGENT_CONTROL_PLANE` default off.
- Deferred (>2h / needs infra): R2 persistence (PERSIST-1), container command daemon for real tool exec (ACP-EXEC), server-side revocation (REVOKE-1), snapshot/restore/clone, Computer-DO launch unblock. All tracked here + BACKLOG.

## Blockers
- Computer-DO multi-image `start()` launches 0 instances (CF API unconfirmed) — live path stays 12-class fleet. [[cf-durable-object-container-launch-blocker]]
- Real agentic tool execution needs a container-side command daemon (not yet in the images) — ACP-EXEC.

## Remaining convergence gaps
- **PERSIST-1 live E2E (P0 acceptance):** the snapshot→R2→restore MECHANISM is impl+deployed+unit-proven, but the real authenticated **destroy+recreate sentinel round-trip** is not yet run on prod (needs a live desktop create + ttyd write + snapshot + container replacement + restore). Exact steps recorded for the next fire.
- **Auto-restore-on-boot (P1, PERSIST-1 follow-up):** restore is a MANUAL route today; a container REPLACEMENT (crash/eviction) leaves `/home` empty until `/restore` is called. True "survives replacement" wants the DO to auto-restore a fresh/empty container from `latest.json` on boot. Not yet wired.
- ACP-EXEC (P1) — control plane lists + arbitrates tools but can't yet drive pixels without the container command daemon.

## Independent review passes
| pass | iter | lens | findings | clean? |
|------|------|------|----------|--------|
| 1 | 1 | security + authz | **P0** client-authoritative connId; P1 unwired roster, unvalidated rehydrate, a11y double-announce, dead DistroMark | no → all fixed |
| 2 | 1 | confirm P0 fix | P0 CONFIRMED-CLOSED; 2 new **P2** (no mcp HTTP-boundary tests; shared `__admin__`) | clean of significant issues |
| 3 | 2 | persistence security + reliability (adversarial) | **0 P0, 1 P1** (flag-flip shadow-restore 2a), **3 P2** (restore auto-boot race; DELETE hot-snapshot; tar traversal belt+braces) | no → P1 fixed; pass 4 pending |

> Convergence rule = 2 consecutive CLEAN passes. Iteration-2 pass 3 found + fixed a P1; a confirming
> pass 4 (verify the `persistenceAvailable` guard + no new hole) remains → NOT claiming PERSIST-1 full convergence.

## P2 backlog (from review)
- **(iter-2) restore auto-boot race:** `containerFetch('/restore')` to a stopped Container may boot it, racing the untar vs start.sh writing `/home`. Fix: gate `/restore` on status `stopped`, or restore to a staging dir + atomic swap in start.sh.
- **(iter-2) DELETE hot-snapshots a live container** (torn archive — logical mid-write, not caught by the gzip gate). Inherent to hot backup; acceptable, or quiesce-then-snapshot later.
- **(iter-2) tar path-traversal belt+braces:** GNU tar already strips leading `/` + skips `../`; add `-P`-off/`--one-top-level` as defense-in-depth on next image rebuild.
- **(iter-2) orphaned backups after DELETE** accumulate in R2 (`home/<id>/`) with no reaper + no recover-deleted UI — R2 cost creep + a recovery feature.
- Route-level (Hono fetch) tests for `/:id/mcp` + the new persistence routes (flag/auth/ownership ordering) — needs `@cloudflare/vitest-pool-workers`.
- Narrow the shared `__admin__` principal (admin-A could drive admin-B's connId; ops-only, low impact).
- Fedora "f" mark fidelity — vision-critic polish pass.
