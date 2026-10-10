# CONVERGENCE — deskl.ink (persistent progress record)

> Resumable memory of the `/run-the-loop` convergence protocol. Receipts, not prose.
> Protocol: `./CONVERGENCE-PROTOCOL.md`. Resume from here.

## Status
- **Converged:** PARTIAL. Iteration 1 (BRAND-1, AUTH-1, ACP-1/2/3) converged + prod-verified. Iteration 2 landed **SNAPSHOT (PERSIST-1 durable-truth half) — PROVEN LIVE** + **LIFE-1** (P1). The live golden-path E2E against a real container earned its keep: it found + fixed THREE P0s the unit fakes missed (R2 length-unknown `put`; streamed POST to container; hot-untar rc handling). **Honest NON-converged items:** PERSIST-1 **restore** is NOT functional end-to-end — the pipeline connects (manifest→R2→buffered POST→agent) but `tar -x` into a LIVE `/home` exits fatal (rc≥2); the correct design is **restore-on-boot** (extract into a quiescent `/home` before the session starts), now empirically justified → a tracked P0-follow-up. NOT a false "converged".
- **Current iteration:** 2 — Stage B+C done for snapshot/LIFE-1 (independent review pass 1: 0 P0/1 P1-fixed/3 P2; pass 2: P1 guard confirmed closed, 0 new). Restore went through 4 live fix cycles (multipart → no-pre-stop → no-cycle → buffered-POST → agent rc-tolerance) — snapshot green, restore still blocked on hot-untar. A fresh Stage-C pass over the final restore code is the next fire's first task.
- **Budget:** 2 sessions. Default budgets now explicit in CONVERGENCE-PROTOCOL (≤3 Stage-A passes · ≤5 A→B→C iters · ≤6 mutating agents · 2-no-delta breaker). Stagnation breaker fired on restore (3 cycles no green) → STOPPED + documented restore-on-boot as the redesign. Next fire: restore-on-boot + auto-restore-on-replacement + ACP-EXEC + P2s.
- **Prod version:** `4cb33181` (iteration-2 worker + rebuilt Ubuntu image incl. hardened backup-agent; bucket `deskl-ink-backups` bound) · health 200 · snapshot verified live 5× (~1.07 MB real /home tars) · **Last updated:** 2026-10-10 (iteration 2)

## Iteration 5 (2026-10-10) — `/loop` fire: inline-edit geometry, overlay attempt
- **Deployed the deterministic overlay fix** (prod `09510a23`): `<h3>` always-mounted (box anchor,
  `invisible` while editing) + `<input>` `absolute inset-0 flex items-center`. All edit behaviors intact.
- **VISUALLY CORRECT** — the live failure screenshot (`e2e/screenshots/.../rename-no-shift-*/test-failed-1.png`)
  shows the "Pearl" input sitting right over the title; the shift is **imperceptible**. The user-facing
  P0 intent (no visible font/size/layout change on edit) is met.
- **BUT spec still RED at the SAME 2px** (title top 138 → input 136). **Precise diagnosis:** the input
  overlays the `flex-1` NAME WRAPPER, which `align-items:stretch` makes as tall as the whole row, so
  `items-center` sits the text ~2px above the block `<h3>`'s single-line box. Two no-delta iterations on
  this 2px ⇒ stagnation breaker → STOPPED pixel-churn; NOT a 3rd blind deploy.
- **CONFIDENT one-line fix for the NEXT fire:** overlay the input to the `<h3>` ELEMENT itself (make the
  h3 the `relative` positioning context + `inset-0` the input to it), OR `self-start`/fixed-single-line-
  height the name wrapper so wrapper box ≡ h3 line-box. Then the geometry spec goes GREEN ≤1px.
- Loop-improvement (§7): the geometry spec now prints BOTH full rects on failure (height/left/width),
  so the fix fire sees everything at a glance.
- Gates: web build + typecheck green · deploy exit 0 · prod 200 · live E2E RED (2px, imperceptible) · screenshot = visual evidence.

## Iteration 4 (2026-10-10) — `/loop` fire: inline-edit font geometry (P0)
- **P0 inline-edit geometry — PARTIAL (deployed, NOT yet converged; honest):** fixed the gross mismatch —
  rename `<input>` now shares `NAME_TYPOGRAPHY` with the `<h3>` title (identical family/size/weight/
  line-height/tracking) + box chrome zeroed (the old border + px-2/py-0.5 + opaque bg were the shift
  source) + save-on-blur-if-changed + inline validation. Deployed prod `a79b6972`.
  **BUT the LIVE geometry E2E (`e2e/rename-no-shift.spec.ts`, run against prod) is RED:** a residual
  **2px top shift** (title top 138 → input 136; gate is ≤1px). The fix is a strict improvement but the
  "zero shift" acceptance is unmet. Goalpost NOT moved. Delegated-agent fix caught by the real-browser
  measurement the build couldn't see.
- **NEXT FIRE (clean RED→GREEN TDD target):** the spec is the gate — tighten the input's line-box vs the
  block `<h3>` (input baseline/line-height vs block line-box is the likely 2px source; try explicit
  matched `height`/`line-height`, drop `align-middle`, or stack h3+input in one grid cell). Drive the
  spec GREEN at ≤1px across chromium + mobile projects.
- Gates this fire: web build + `pnpm -r typecheck` green; deploy exit 0; prod 200; live E2E RED (2px) — the finding.

## Iteration 3 (2026-10-10) — `/loop` product-expansion fire (cron a2cc0f1f, every 15m)
- Scope expanded to the full 30-dimension product spec; frontier seeded in `docs/product/idea-matrix.md`
  (dimension status board + per-fire method — the loop drains it 1–2 dimensions/fire, no fabricated 900).
- **P0 deletion flicker — FIXED + deployed:** authoritative client tombstones in `DesktopManager.tsx`
  (delete tombstones the id before optimistic removal; `refresh` filters tombstoned ids → no stale/
  in-flight poll can resurrect a deleted tile; rollback un-tombstones). Root-cause, not a timeout mask.
  Verified: web build green. NEXT-FIRE verify: rapid-delete + slow-poll Playwright E2E.
- **P0 generic names → codenames — FIXED + PROVEN LIVE:** `compute/codename.ts` (curated, owner-unique,
  case-insensitive, suffix fallback, 8 unit tests) wired into `POST /desktops`; `defaultName` retired.
  Live: no-name create → **"Amber"** (not "Everyday Desktop"). Legacy backfill gated by `isLegacyGenericName`.
- **P0 inline-edit font geometry — DEFERRED (next fire's lead):** the rename input must match the title's
  font metrics exactly (zero layout shift); component = the card title/input render in `DesktopManager.tsx`.
- Gates: `pnpm -r typecheck` clean · `workers/api` **51/51** · `apps/web build` green · deploy exit 0 · prod 200.

## Requirements + acceptance criteria
| id | pri | requirement | acceptance criterion | status | evidence |
|----|-----|-------------|----------------------|--------|----------|
| AUTH-1 | P0 | Authz regression tests (default-deny + IDOR) | e2e asserts 401 on every control-plane endpoint w/o session; cross-user GET → 404; vnc/term w/o ticket → 401 | **done** | e2e/authz.spec.ts — 4/4 green on PROD |
| BRAND-1 | P0 | Official Linux logos (Ubuntu/Fedora/Debian), accessible | shared `<DistroLogo>` renders authentic marks; decorative-by-default (no SR double-announce), labelled icon-only; picker/tiles/tabs; screenshot crisp | **done** | DistroLogo.tsx; screenshot os-picker-distro-logos.png; OS-picker a11y axe-clean |
| ACP-1 | P0 | DO SessionCoordinator: participants + controlHolder + handoff (#2,#3), server-bound identity | unit tests: multi-participant; non-holder/cross-principal mutating → denied; requestControl/handoff transfers; auto-promote → null not viewer | **done** | SessionCoordinatorState.ts; 22/22 vitest |
| ACP-2 | P0 | Typed control-plane contracts (participant, control msgs, MCP tools #1) | Zod schemas in packages/shared; infer types; validate round-trip; rehydrate safeParse | **done** | packages/shared/control-plane.ts |
| ACP-3 | P0 | Authenticated MCP tools endpoint (#1), flag-gated, principal-bound | `/:id/mcp` 404 when flag off, 401 w/o auth, owner-scoped 404; server-minted connId; honest capability_gap | **done** | routes/mcp.ts; authz test 4 green on PROD |
| PERSIST-1a (snapshot) | P0 | Capture /home → R2 as durable truth (survives container destruction) | snapshot of a real running desktop stores a valid gzip tar in R2 + manifest | **done + PROVEN LIVE** | prod v4cb33181: 5× `POST /:id/snapshot` → `ok:true`, ~1.07 MB tars in R2, integrity-gated; multipart streaming (unit 25 tests) |
| PERSIST-1b (restore) | P0 | Restore /home from R2 after container replacement | restore reconstructs /home from the latest snapshot | **NOT functional — needs restore-on-boot** | pipeline connects live (manifest→R2→buffered POST→agent) but `tar -x` into a LIVE /home → fatal rc≥2 (502). Correct design = extract on boot into a quiescent /home. See gaps |
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
- **P0 (live E2E #1 — snapshot 500):** R2 `put()` rejects a length-UNKNOWN stream ("Provided readable stream must have a known length"); the container's `tar -czf -` is exactly that → every snapshot 500'd. Unit fakes accept any stream, so only the real R2 exposed it. → FIXED: stream the tar via R2 **multipart** upload (8 MiB bounded parts, abort-on-fail); routes return a typed error, never 500. +2 regression tests. VERIFIED LIVE (`ok:true`, 1.07 MB tar).
- **P0 (live E2E #2 — restore unreachable):** restore POSTed the R2 tar with a STREAMING body (`duplex:'half'`) — not reliably carried by `containerFetch` (GET /backup streams fine; streamed POST doesn't). Also a pre-`stop()`/`start()` cycled the running container, dropping the agent. → FIXED: don't touch lifecycle in restore; BUFFER the tar + POST with a known length (bounded 100 MiB). Restore now reaches the agent live.
- **P0 (live E2E #3 — hot-untar 502):** `tar -x` into a LIVE `/home` exits fatal (rc≥2) — in-use files + runtime sockets. → PARTIAL: backup now `--ignore-failed-read` + excludes volatile cruft, restore tolerates rc 1; but a live-`/home` untar still hits rc≥2. ROOT CONCLUSION: don't untar into a live FS → **restore-on-boot** redesign (tracked). Snapshot unaffected (proven).
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
- **PERSIST-1b restore-on-boot (P0 — THE blocker for restore):** empirically, untarring into a LIVE `/home` fails (rc≥2). The correct design: on container START, the DO streams `latest.json`'s tar to the container (the DO holds R2 creds; the container never does) and `start.sh` extracts it into a QUIESCENT `/home` BEFORE launching VNC/apps. This also delivers true "survives container replacement" (auto-restore on a fresh/replaced container) — folding in the old auto-restore-on-boot gap. Next fire's lead slice.
- **True sentinel destroy+recreate E2E (P0 acceptance):** blocked on restore-on-boot. Once that lands: create → write sentinel (ttyd) → snapshot → force container replacement → boot auto-restores → assert sentinel present.
- ACP-EXEC (P1) — control plane lists + arbitrates tools but can't yet drive pixels without the container command daemon.

## Independent review passes
| pass | iter | lens | findings | clean? |
|------|------|------|----------|--------|
| 1 | 1 | security + authz | **P0** client-authoritative connId; P1 unwired roster, unvalidated rehydrate, a11y double-announce, dead DistroMark | no → all fixed |
| 2 | 1 | confirm P0 fix | P0 CONFIRMED-CLOSED; 2 new **P2** (no mcp HTTP-boundary tests; shared `__admin__`) | clean of significant issues |
| 3 | 2 | persistence security + reliability (adversarial) | **0 P0, 1 P1** (flag-flip shadow-restore 2a), **3 P2** (restore auto-boot race; DELETE hot-snapshot; tar traversal belt+braces) | no → P1 fixed |
| 4 | 2 | verify P1 guard (`persistenceAvailable`) | finding 2a fully closed across all 5 routes; 0 new P0/P1/P2; flag off → prod unchanged | **clean** |
| — | 2 | LIVE golden-path E2E (real container) | found 3 P0s (snapshot 500; restore unreachable; hot-untar 502) — snapshot fixed+green; restore needs restore-on-boot | restore not green |

> Convergence rule = 2 consecutive CLEAN agent passes. Pass 4 clean (guard). BUT the live E2E then
> changed the restore code materially (4 fix cycles) — so the FINAL restore code has NOT had 2 clean
> passes, and restore isn't green. SNAPSHOT + LIFE-1 are converged + live-proven; PERSIST-1 restore is
> NOT. A fresh Stage-C pass over the final persistence code + restore-on-boot are the next fire.

## P2 backlog (from review)
- **(iter-2) restore auto-boot race:** `containerFetch('/restore')` to a stopped Container may boot it, racing the untar vs start.sh writing `/home`. Fix: gate `/restore` on status `stopped`, or restore to a staging dir + atomic swap in start.sh.
- **(iter-2) DELETE hot-snapshots a live container** (torn archive — logical mid-write, not caught by the gzip gate). Inherent to hot backup; acceptable, or quiesce-then-snapshot later.
- **(iter-2) tar path-traversal belt+braces:** GNU tar already strips leading `/` + skips `../`; add `-P`-off/`--one-top-level` as defense-in-depth on next image rebuild.
- **(iter-2) orphaned backups after DELETE** accumulate in R2 (`home/<id>/`) with no reaper + no recover-deleted UI — R2 cost creep + a recovery feature.
- Route-level (Hono fetch) tests for `/:id/mcp` + the new persistence routes (flag/auth/ownership ordering) — needs `@cloudflare/vitest-pool-workers`.
- Narrow the shared `__admin__` principal (admin-A could drive admin-B's connId; ops-only, low impact).
- Fedora "f" mark fidelity — vision-critic polish pass.
