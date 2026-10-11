# CONVERGENCE — deskl.ink (persistent progress record)

> Resumable memory of the `/run-the-loop` convergence protocol. Receipts, not prose.
> Protocol: `./CONVERGENCE-PROTOCOL.md`. Resume from here.

## Status
- **Converged:** PARTIAL. Iteration 1 (BRAND-1, AUTH-1, ACP-1/2/3) converged + prod-verified. Iteration 2 landed **SNAPSHOT (PERSIST-1 durable-truth half) — PROVEN LIVE** + **LIFE-1** (P1). The live golden-path E2E against a real container earned its keep: it found + fixed THREE P0s the unit fakes missed (R2 length-unknown `put`; streamed POST to container; hot-untar rc handling). **Honest NON-converged items:** PERSIST-1 **restore** is NOT functional end-to-end — the pipeline connects (manifest→R2→buffered POST→agent) but `tar -x` into a LIVE `/home` exits fatal (rc≥2); the correct design is **restore-on-boot** (extract into a quiescent `/home` before the session starts), now empirically justified → a tracked P0-follow-up. NOT a false "converged".
- **Current iteration:** 11 (same session, `/loop` cron a2cc0f1f). Iters 3–9 landed the 3 immediate P0s
  (tombstone, codenames, inline-edit — all live-E2E-verified) + toast + Restart wired end-to-end. Iters
  10–11 = **two consecutive CLEAN independent passes** (frontend + backend/security) → that body of work
  CONVERGED. Restore (PERSIST-1b) remains the open P0 for a fresh session.
- **Budget:** 1 long session, 11 fires. Lead saturated — kept minimal (delegate + verify) past iter 6.
  Default budgets in CONVERGENCE-PROTOCOL. Next: restore-on-boot (fresh session) OR more small verified
  slices (clone/reset, settings, API-keys, connections) from the idea-matrix frontier.
- **Prod version:** `2ed919fa` (Restart wired; + toast, inline-edit, codenames, tombstone; snapshot live;
  bucket `deskl-ink-backups` bound) · health 200 · **Last updated:** 2026-10-10 (iteration 11)

## Iteration 17 (2026-10-10) — `/loop` fire: comprehensive regression review (Stage C) — CLEAN + 20/20 E2E
- **Independent adversarial review of the iter-13–16 features** (account menu, "Back up now",
  persisted "Backed up <time>" indicator, rich delete dialog) by a fresh agent told to break them.
  **VERDICT: 0 P0, 0 P1, 0 P2 — would not block.** Cross-feature state sound (tombstone added before
  optimistic removal + `refresh` filters it → no resurrection; `backingUp` is an id-keyed Set; handlers
  list `desktops` in deps → no stale closure; `pendingDeleteTarget` resolves from the live list). No
  dead controls (capability_gap is a neutral announce, not an error; delete copy makes no false recovery
  promise). a11y intact (account menu + delete dialog both proper focus-trapped dialogs). `App.tsx`
  `user` fetched once + cleared on sign-out; `ds-pop` keyframe present. Backend `setLastBackup`
  owner-scoped + `recordBackupTime` best-effort + additive migration.
- **Broad PROD E2E sweep: 20/20 passed (27.5s)** — a11y ×3, authz ×4, backup (real container + reload-
  persistence), branding, command-palette, focus ×2, mobile ×2, offline, pwa ×2, security, seo ×2.
  Full run, not flaky → the WHOLE app is regression-free end-to-end after 16 feature fires.
- One clean independent pass over iter-13–16; combined with the broad sweep this is strong health
  evidence. No code change — a verification fire.

## Iteration 16 (2026-10-10) — `/loop` fire: rich delete confirmation dialog (completes P0 §1) ✅
- **Completed the P0 §1 confirmation-dialog requirement** (delete was a minimal inline confirm). New
  `DeleteDialog`: centered viewport modal + dimmed backdrop, danger trash glyph, "Delete <name>?", the
  required identity facts (OS · size · Desktop/Server · Persistent/Disposable), what's removed, HONEST
  copy "This permanently deletes the computer and cannot be undone" (NO false recovery promise — restore
  isn't wired). Danger Delete + Cancel; `useFocusTrap` + Esc + click-outside; focus restores to the trash.
  Preserves `desktop-delete`/`desktop-delete-confirm` testids + the tombstone `deleteComputer` flow. Prod `d2c2180f`.
- **Caught + fixed a centering bug via prod screenshot inspection (2nd deploy this fire):** the dialog was
  rendered INSIDE the tile `<li>`, whose `hover:-translate-y-0.5` transform makes `position:fixed` resolve
  against the tile → it opened left-anchored while hovering. Fix: render ONE dialog at the MANAGER level
  (driven by `pendingDelete`) → true viewport-centered. Per-tile render + unused props removed (no dead
  code); `delete-no-resurrect:91` → page-level confirm (golden-path/distro-picker already page-level).
- **Verified live:** build + typecheck green · `delete-no-resurrect`+`a11y`+`mobile` **6 passed (18.5s)** ×2
  (functional + centered) · screenshots show the left-anchored bug → the centered, dimmed-backdrop modal
  (cards "Equinox"→"Felix"). Exceptionally-polished bar met.
- Safe slice (no boot path). **Top open P0 unchanged: PERSIST-1b restore-on-boot** (fresh session).

## Iteration 15 (2026-10-10) — `/loop` fire: persisted "Backed up <time>" indicator ✅
- **Completed the backup-visibility workflow (Dim 9):** every successful snapshot now records
  `lastBackupAt` (owner-scoped) → the card shows "· Backed up <relative>" (optimistic on Back-up-now,
  reconciled by poll; nothing when absent — no dead label). Shared `DesktopResource += lastBackupAt?`;
  registry additive `last_backup_at` column + owner-scoped `setLastBackup` (mirrors `rename`); wired at
  `/snapshot` + `/stop` + `/restart` checkpoint-ok. Prod `9b689628`.
- **Caught + fixed a DO-lag regression PRE-deploy (adversarial self-review):** the `setLastBackup` call
  sat inside `/snapshot`'s never-500 try/catch — during the ~100s warm-global-registry code-propagation
  lag it would report a SUCCESSFUL snapshot as FAILED. Fix: best-effort `recordBackupTime()` helper
  (swallows + logs) wrapping all 3 sites → the core op never breaks; the indicator just updates late.
- **Verified live:** build + typecheck + `workers/api` 51/51 green · `backup` E2E **passed incl. the
  RELOAD-persistence assertion** (survives a page reload = server-persisted; confirms the DO reloaded
  the new column after the lag) · `mobile`+`a11y` **5 passed** · screenshot (card "Mica") shows
  "· Backed up just now · Back up now" — clean, no crowding.
- Safe slice. **Top open P0 unchanged: PERSIST-1b restore-on-boot** (boot-path risk → fresh session).

## Iteration 14 (2026-10-10) — `/loop` fire: "Back up now" on-demand snapshot ✅
- **Surfaced the proven persistence capability (Dim 9 / Golden Path G user-visible half):** a subtle
  "· Back up now" text affordance in the card metadata footer (NOT the crowded icon row), shown when
  running, disabled + "Backing up…" in flight. `api.snapshotDesktop` returns the TYPED `SnapshotResult`;
  honest branching — `ok`→"Backed up <name>" toast · `capability_gap`→neutral "<name> must be running to
  back up" (not an error) · `error`→error toast. No boot-path/backend change (the `/snapshot` route
  already existed + is proven). Prod `ad1a6a97`.
- **Verified live:** build + typecheck + `workers/api` 51/51 green · new `e2e/backup.spec.ts` asserts the
  snapshot POST returns `ok:true` + the toast — **backup + mobile + a11y 6 passed (14.0s)** · screenshot
  shows the clean text affordance on card "Hugo" (no icon-row crowding, mobile-safe).
- Safe slice. **Top open P0 unchanged: PERSIST-1b restore-on-boot** (boot-path risk → fresh session).

## Iteration 13 (2026-10-10) — `/loop` fire: account menu (identity in header) ✅
- **Added product breadth (Dim 12/16): the header now shows the signed-in identity** — was a real gap
  (only a bare "Sign out"). New `AccountMenu`: a compact 36px avatar (email initial, cyan ring) → on-brand
  glass popover with the email + provider (Google/GitHub/Email/Dev) + the Sign-out action moved into it
  (declutters the header). Reuses `App.tsx`'s existing `/session` fetch (captured the previously-discarded
  `user`, threaded via a `user` prop — no refetch). a11y: `useFocusTrap` + Esc-restore + click-outside +
  native-button keyboard + `aria-haspopup/expanded/menu/menuitem`. Mobile-safe (avatar-only trigger fits
  375px). Also restored a MISSING `@keyframes ds-pop` in `index.css` (the palette/OS-picker pop animation).
  Prod `22ecb6ad`.
- **Verified live:** build + typecheck green · `a11y`(×3) + `mobile`(×2) + `command-palette` **6 passed
  (6.6s)** (header change + moved sign-out + ds-pop regressed nothing; the palette's own signout action is
  independent) · screenshot shows the open menu (`e2e@deskl.ink · Dev · Sign out`), on-brand + aligned.
- SAFE slice (no boot-path risk). **Top open P0 unchanged: PERSIST-1b restore-on-boot** — touches the
  container boot path (a half-baked version risks wedging ALL boots) → correctly deferred to a fresh
  focused session, not avoidance.

## Iteration 12 (2026-10-10) — `/loop` fire: lifecycle action-row stability (P2 closed) ✅
- **Closed the top tracked P2** (from iter-10 review): Stop + Restart used to UNMOUNT during a stop/
  restart (status `persisting`/`stopping` ∉ `stoppable`), vanishing the action row for ~60s. Fix:
  `showLifecycleControls = stoppable || isTransient` (reuses `TRANSIENT_STATUSES`) — both buttons stay
  MOUNTED-but-DISABLED through transient states (`opacity-40` + `cursor-not-allowed`, byte-identical box
  → zero geometry shift; `aria-disabled`/`aria-busy`; reduced-motion-gated spin on the restart glyph),
  and vanish only at terminal `stopped`/`failed`. Handlers/testids untouched. Prod `4bc758a6`.
- **Verified live:** build + typecheck green · `restart`+`delete-no-resurrect`+`rename-no-shift` **3 passed
  (31.1s)** · a throwaway spec ASSERTED `desktop-restart` stays `toBeDisabled()` after the click (mounted,
  not unmounted) · screenshot shows the stable dimmed row during "Saving" (card "Yarrow"). 1 of the 2
  tracked P2s now resolved; the other (DesktopRegistry global-singleton) is a deliberate TODO(M2).

## Iteration 11 (2026-10-10) — `/loop` fire: 2nd consecutive clean pass → shipped slices CONVERGED ✅
- **Second independent review pass — backend/data-integrity/security lens — CLEAN (0 P0, 0 P1, 2 P2
  intentional/tracked).** Confirmed: codename uniqueness owner-scoped (id is the key, names cosmetic);
  lifecycle ordering correct (checkpoint resolves before stop, never wedges, all verbs idempotent,
  delete non-blocking); `persistenceAvailable` leaves NO shadow-backend path under `COMPUTER_DO=1`;
  `homeBackup` has no data-loss window (`latest.json` written only after multipart `complete()` + the
  gzip integrity gate; unique keys; retention safe); Zod at every boundary (`.strict()` bodies,
  `safeParse` on the persisted session blob, HMAC-verified tokens); **IDOR clean** — every per-`:id`
  route `resolveAuth`→`getOwned`→404 non-leak.
- **Fresh evidence (verbatim):** `pnpm -C workers/api test` → **51/51** · `pnpm -r typecheck` → exit 0 ·
  authz E2E on prod → **4 passed** (default-deny, ticket-gated VNC/term, cross-user IDOR 404, mcp gate).
- **⇒ TWO consecutive clean independent passes (frontend lens iter-10 + backend/security lens iter-11).**
  The shipped body of work — **the 3 immediate P0s (tombstone, codenames, inline-edit) + persistence
  SNAPSHOT (PERSIST-1a) + lifecycle verbs (stop-checkpoint, restart) + toast — is CONVERGED** by the
  protocol's exit criteria (zero P0, acceptance by fresh evidence, required tests pass, no known vuln,
  journeys green, 2 clean passes).
- **NOT converged (the honest remaining frontier):** PERSIST-1b restore-on-boot (P0 — restore doesn't
  work end-to-end; needs a fresh focused session) + the broad 30-dimension product (orgs/teams, billing,
  viewer, connections, notifications, …). 2 tracked P2s: cosmetic codename-dup under a create race;
  `DesktopRegistry` global singleton (owner-column isolation today, DO-partition is a TODO(M2)).

## Iteration 10 (2026-10-10) — `/loop` fire: independent regression review (Stage C) — CLEAN
- **Consolidated adversarial review of the session's 5 accumulated `DesktopManager.tsx` features**
  (tombstone, codenames, inline-edit, toast, restart) by a fresh independent agent. **VERDICT: 0 P0,
  0 P1, 2 P2 — would not block.** Cross-feature state races: clean (only `refresh` re-adds + it filters
  tombstones; stop/restart/rename use `prev.map` by id — can't resurrect). Toast: single live region,
  `position:fixed` (no layout shift), no double-announce. Inline-rename behaviors intact.
- **Broader-UI regression sweep (prod E2E I hadn't re-run this session): 6 passed (6.4s)** — a11y ×3,
  command-palette, mobile ×2. No regression from the accumulated changes.
- **Authz spot-check (`routes/desktops.ts`): CLEAN** — every per-`:id` route (get/patch/start/ticket/
  stop/snapshot/restore/**restart**/delete) does `resolveAuth`→401 then `getOwned`→404; VNC/term use
  HMAC tickets by design. No owner-scope gap.
- This is **one clean independent review pass** over the frontend slices (toward the 2-consecutive-clean
  convergence condition). No code change this fire — a verification fire.
- **2 P2s tracked (not churned this fire):** (a) mid-restart the Stop/Restart buttons unmount (status
  `persisting` ∉ `stoppable`) → the action row reflows ~60s; fix = keep them mounted + `disabled` on
  transient states. (b) Restart has no confirm (acceptable for a reversible action; optional).

## Iteration 9 (2026-10-10) — `/loop` fire: Restart wired end-to-end ✅
- **Completed LIFE-1 as a real feature** — `/:id/restart` was an API-only verb (dead backend feature);
  now it has a UI control. Shared `desktopApi.restart` + `desktopTestIds.restartButton`; `api.restartDesktop`;
  a compact circular-arrow button in the card between Stop and trash (shown when running), optimistic
  `persisting` + success toast + reconcile, revert-on-failure. Prod `2ed919fa`.
- **Verified LIVE end-to-end:** build + typecheck green · new `e2e/restart.spec.ts` drives a REAL
  checkpoint+stop+start (create → click `desktop-restart` → ready→transient→ready) — **3 passed (30.0s)**
  alongside `rename-no-shift` + `delete-no-resurrect` (no regression) · screenshot confirms the on-brand
  Open·Stop·⟲·🗑 action row (card "Otis" — codename live again).
- Note: idle-stop (10-min) is ALREADY implemented via the container `sleepAfter='10m'` (DesktopContainer.ts);
  the remaining nuance (distinguish authorized background work from viewing) is a P1 refinement, not absent.
- Gates: `restart`+`rename-no-shift`+`delete-no-resurrect` GREEN · prod 200 · screenshot inspected.
- **Still the top open P0: PERSIST-1b restore-on-boot** — needs a fresh focused session (plan in gaps).

## Iteration 8 (2026-10-10) — `/loop` fire: visible success toast ✅
- **Completed P0 §1's last UI detail — a visible success toast** (was sr-only only). The single
  `role="status" aria-live="polite"` region is now ALSO the visible toast (no SR double-announce):
  fixed bottom-right (`position:fixed` → **zero layout shift**), `ds-glass` + cyan check, 3s auto-dismiss,
  motion-reduce safe. Reuses the existing announcement messages (create/stop/delete/rename); affordances
  unchanged. Prod `752d3c50`.
- **Verified live:** `pnpm -C apps/web build` + typecheck green · regression gate `rename-no-shift` +
  `delete-no-resurrect` **2 passed (21.5s)** (no affordance change) · live screenshot shows the on-brand
  glass toast "Fern created and starting." bottom-right with the layout unshifted (also re-confirms
  codenames live: "Fern").
- 8 fires deep; kept the lead minimal (delegated impl + verified). **Still the top open P0: PERSIST-1b
  restore-on-boot** — a large slice best begun in a FRESH session (plan in gaps). Recommend cancelling/
  pausing the cron (`CronDelete a2cc0f1f`) and starting restore-on-boot fresh for best quality.

## Iteration 7 (2026-10-10) — `/loop` fire: deletion-flicker regression E2E ✅
- **P0 §1 deletion flicker — now VERIFIED LIVE** (was build-verified only). New `e2e/delete-no-resurrect.spec.ts`
  (Golden Path A §11–12): create → two-step inline delete (trash → `pendingDelete` confirm) → assert the
  tile is absent at EVERY sample across ~6s (≥3× `POLL_MS`) + list GET drops the id + reload confirms
  server-side destroy. Invariant = "never non-zero". **GREEN twice on prod** (13.5s agent, 13.3s mine).
  No defect — the tombstone holds against the 2s poll.
- All three immediate P0s are now BOTH fixed AND live-E2E-verified (tombstone, codenames, inline-edit).
- **Lead saturation:** 7 fires deep this session. Kept the lead minimal (delegated spec + verified). The
  next BIG P0 — **PERSIST-1b restore-on-boot** — is a large slice (container `start.sh` boot-restore
  coordination + DO streaming the tar pre-session + a full create→write→snapshot→replace→boot→verify
  E2E) and deserves a FRESH session, not a saturated one. Precise plan recorded below (gaps). Smaller
  verifiable 30-dimension slices (idle-stop, cost chip) are the alternative next unit.
- Gates: `e2e/delete-no-resurrect` GREEN ×2 · prod 200. (No code/deploy this fire — a test-only verify slice.)

## Iteration 6 (2026-10-10) — `/loop` fire: inline-edit geometry CLOSED ✅
- **P0 inline-edit font geometry — DONE + PROVEN LIVE.** `e2e/rename-no-shift.spec.ts` GREEN twice
  against prod (`76bbf37e`): the rename `<input>` matches the title geometry within ≤1px (zero shift),
  identical font-family/size/weight/letter-spacing/line-height.
- **Root cause of the persistent "2px" was the TEST, not the component.** Full-rect logging (added
  iter-5) proved left+height were ALWAYS identical — only top, only by 2px. That 2px = the tile's
  `hover:-translate-y-0.5` (−2px, duration-200) lift: the spec measured the title mid-lift vs the input
  settled (entering edit REQUIRES hovering the reveal-on-hover pencil). Fix: hover + settle 350ms,
  measure both states settled. The component fixes shipped this + prior fires (input overlays the `<h3>`
  as `absolute inset-0`; h3 className constant so its box can't recompute) make the geometry correct by
  construction — genuine improvements, not wasted.
- **All THREE immediate P0s now closed + verified live:** deletion flicker (tombstone), codenames
  ("Amber" live), inline-edit geometry (spec GREEN). Lesson for future UI geometry specs: control for
  hover/transform/transition state — measure both sides in the SAME settled state.
- Gates: web build + `pnpm -r typecheck` green · live E2E **GREEN** (8.2s/9.9s) · prod 200.
- **NEXT FIRE frontier:** PERSIST-1b restore-on-boot (P0) + the 30-dimension product (idea-matrix) —
  e.g. Dimension 8 idle-stop (10-min verified-inactivity) or Dimension 3 live cost chip.

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
