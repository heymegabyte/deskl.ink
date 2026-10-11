# Golden Paths A–H — coverage & status

> The product brief's eight end-to-end journeys = the per-dimension definition of done. This maps each
> to its **real-browser E2E** (Playwright against the LIVE app + backend on `deskl.ink`, not mocks) and
> its honest status. SSOT for progress: `.claude/run-the-loop/CONVERGENCE.md`. Specs live in `e2e/`.
> Status: ✅ done+verified · ◧ partial/foundation · ⛔ blocked/not-built (with the precise reason).

| Path | Journey | Status | E2E (prod) · notes |
|------|---------|--------|--------------------|
| **A** | New individual: sign-up → create Ubuntu → open → stop → restart → persist → delete → stays gone | ✅ | `golden-path.spec` (create→VNC-painted→delete), `restart.spec` (real checkpoint+stop+start), `delete-no-resurrect.spec` (tombstone: never reappears across ≥3 polls + reload), `backup.spec` (persist = snapshot→R2 + "Backed up" indicator). Auth via secret-gated dev-login. *Persist = durable snapshot; full restore = Path G.* |
| **B** | Rename: inline-edit → Enter saves → consistent everywhere → reload persists | ✅ | `rename.spec` (inline rename persists across reload), `rename-no-shift.spec` (input geometry == title ≤1px, zero layout shift). |
| **C** | Team: create org → invite → role → shared computer → permission enforcement → remove → revoke | ⛔ | **Not built** — orgs/teams (Dim 13) is a foundational multi-tenant decision; the registry is a global singleton with owner-column isolation (TODO(M2) DO-partition). The single-tenant authz boundary is proven (Path H); multi-tenant is net-new. |
| **D** | Settings: edit profile → appearance → notifications → connection → save → reload persists | ◧ | `settings.spec` (default-new-computer distro/size → pre-selects in picker → reload persists; Appearance → Reduce motion → `<html data-reduce-motion>` → reload persists). Account identity read-only. *Notifications/connections/API-tokens = future.* |
| **E** | Billing: review usage → budget → test-mode change → metered computer → ledger → stop → billing stops | ◧ | Cost **transparency** shipped (header live cost chip + per-size estimates in the creation picker, both from `estimateDesktopCost` — no invented prices). **Stripe billing / usage ledger / budgets = not built** (Dim 22/23; Stripe TEST-mode, needs real CF-cost analysis before pricing). |
| **F** | AI agent: agent computer → MCP/API auth → scoped perms → observe → act → record → handoff → revoke | ◧ | `authz.spec` covers the MCP tools endpoint (`/:id/mcp` 404 flag-off, 401 no-session, owner-scoped). Control-plane arbiter (participants + control holder + handoff) shipped flag-gated (ACP-1/2/3, 22 unit tests). **Real tool execution (click/type/run) blocked — ACP-EXEC needs a container command daemon.** |
| **G** | Data recovery: modify files → checkpoint → stop → restore after container replacement → data intact | ◧ | **Snapshot half PROVEN LIVE** — `/:id/snapshot` streams a real ~1 MB `/home` tar to R2 (multipart, integrity-gated), checkpoint-before-stop, best-effort pre-delete snapshot; `backup.spec` green. **Restore half = the open P0 (PERSIST-1b):** can't untar a live `/home` (rc≥2) → needs **restore-on-boot**, fully designed in `docs/architecture/compute-and-persistence.md` §4, acceptance gate §5 (ttyd sentinel round-trip). Fresh-session slice (boot-path). |
| **H** | Cross-workspace isolation: separate orgs → switch → scoped data → cross-tenant denied → no leak | ◧ | **Cross-USER isolation PROVEN** — `authz.spec` (4 green on prod): default-deny 401 on every control-plane route w/o session; cross-user GET → 404 (indistinguishable from unknown); VNC/term require signed HMAC ticket; the client tombstone prevents stale-state leakage across account switches. **Cross-ORG (workspaces) = not built** (depends on Path C). |

## Verification method (all paths)
Real Chromium via Playwright against `https://deskl.ink` (`DESKL_BASE_URL` + secret-gated `DESKL_TEST_AUTH`),
6 breakpoints where layout matters, axe-clean, console-error-free, screenshot + visual inspection of
every touched screen, hermetic + self-cleaning (create → act → `page.request.delete`). Container-spinning
specs create a real desktop; the broad sweep (iter-17) ran **20/20 green**.

## Honest rollup
**A, B fully converged + live-verified.** D foundation shipped + verified. E/F/G/H have their
**single-tenant / display / snapshot** halves done + verified; their **billing / real-agent-exec /
restore / multi-tenant** halves are net-new or the one open P0. **C is net-new** (orgs/teams). The one
P0 that gates a journey (G, restore-on-boot) is **designed + handed off**; everything else remaining is
new product scope (orgs/teams, billing, agent-exec), best taken on in fresh focused sessions.
