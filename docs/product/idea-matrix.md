# DeskLink — Product Idea Matrix

> The structured product-expansion frontier for the `/run-the-loop` convergence protocol (15-min
> cadence). SSOT for scope + progress is `.claude/run-the-loop/CONVERGENCE.md`; this file is the
> **dimension-by-dimension idea backlog** the loop drains. Existing deep docs:
> `docs/product/decisions.md` + `docs/product/deskl-converged-spec.md` (do not duplicate — link).
>
> **Method per dimension (one loop fire owns 1–2 dimensions):** research competitors + inspect the
> live implementation → generate ~30 candidate ideas → score → implement the strongest ~30% that pass
> the hard gates → verify with real gates (typecheck · tests · build · E2E · prod) → record status
> here. Do NOT fabricate 900 ideas up front; expand a dimension the fire you implement it, so every
> listed idea is real, scored, and either shipped or a concrete next-unit.

## Scoring rubric (weights; security + feasibility are HARD GATES, not just scores)

| Criterion | Weight |
|---|---:|
| User value & usefulness | 25% |
| Revenue / retention | 15% |
| UI/UX improvement | 15% |
| Architectural leverage | 15% |
| Security & reliability | 10% (gate: unsafe → reject) |
| Feasibility / time-to-value | 10% (gate: impossible-on-platform → reject) |
| Differentiation | 10% |

Reject: unsafe, platform-impossible, economically unsustainable, or confusing. Dedupe without losing coverage.

## Dimension status board

`done` = top-30% selected + implemented + verified · `active` = being worked this/next fire · `queued` = frontier.

| # | Dimension | Status | This-fire slices (shipped) · next unit |
|---|-----------|--------|----------------------------------------|
| 1 | State mgmt & UI correctness | **active** | ✅ delete-tombstone (no flicker). Next: cross-tab `BroadcastChannel` sync; adversarial UI-state E2E |
| 2 | Computer naming & identity | **active** | ✅ codename generator (owner-unique, curated, suffix-fallback). Next: **inline-edit font geometry (P0, deferred)**; legacy-name backfill via `isLegacyGenericName`; tags/aliases |
| 3 | Global UI / nav / design system | queued | command palette exists; expand: org switcher, live cost chip, resizable panels |
| 4 | Computer fleet dashboard | queued | cards + status exist; expand: table view, filters, saved views, bulk actions |
| 5 | New computer creation | queued | quick-create + OS picker exist; expand: multi-step wizard, version selector, cost estimate |
| 6 | Desktop viewer & streaming | queued | noVNC live; evaluate Selkies 2.x WS transport; resolution/clipboard/DnD |
| 7 | Headless servers & terminal | queued | ttyd live; expand: multi-tab, SSH keys, port previews, metrics |
| 8 | Lifecycle management | **partial** | ✅ restart (LIFE-1); stop checkpoints. Next: 10-min idle auto-stop (verified-activity), schedules |
| 9 | Persistence, backups, recovery | **partial** | ✅ snapshot→R2 (PERSIST-1a, live). Next: **restore-on-boot (P0)**, backup mgmt UI, retention |
| 10 | File management | queued | file explorer, upload/download, resumable transfers |
| 11 | Joined computers (BYOC) | queued | secure companion + outbound pairing; per-platform adapters |
| 12 | Auth & account identity | **partial** | ✅ Google/GitHub/magic-link (M2, live). Next: passkeys, sessions/devices, MFA |
| 13 | Orgs, teams, workspaces | queued | foundational multi-tenant; personal stays simple (progressive disclosure) |
| 14 | Permissions & collaboration | **partial** | ✅ control-plane arbiter (ACP-1/2/3). Next: RBAC roles, observer sessions, expiring deep links |
| 15 | Enterprise identity & admin | queued | Better Auth SSO/SCIM (verify licensing first); domain verify; audit export |
| 16 | Personal & org settings | queued | profile, appearance, defaults, privacy — persisted; progressive disclosure |
| 17 | Connections & integrations | queued | common framework; truthful connected/disconnected state; GitHub/Drive/Slack/Infisical first |
| 18 | Notifications | queued | in-app inbox + email + push matrix; quiet hours; retry/dedupe pipeline |
| 19 | AI agents & computer-use | **partial** | ✅ MCP tools endpoint (ACP-3, flag-gated). Next: container command daemon (ACP-EXEC), approvals |
| 20 | Recording, memory, replay | queued | screenshot timeline, OCR search, consent/redaction, retention |
| 21 | APIs, CLI, SDK, MCP | **partial** | ✅ versioned REST + MCP endpoint. Next: OpenAPI, TS SDK, scoped tokens, webhooks |
| 22 | Billing, wallet, subscriptions | queued | Stripe TEST mode; live cost chip; wallet/credits; metered reconciliation |
| 23 | Usage, quotas, FinOps | queued | durable metering ledger; spend caps → auto-stop; no double-billing on restart |
| 24 | Security, privacy, zero-trust | **active** | ✅ default-deny + owner-scope authz (AUTH-1, live); tenant isolation. Next: audit events, rate limits |
| 25 | Reliability & performance | **partial** | ✅ noVNC auto-reconnect, readiness. Next: circuit breakers, perf budgets |
| 26 | Observability & support | **partial** | ✅ structured logs + request ids + CSP reporting. Next: Sentry DSN, diagnostics page |
| 27 | Templates & dev productivity | queued | template gallery, stack presets, repo→env workflow |
| 28 | Mobile, PWA, a11y | **partial** | ✅ axe-clean + focus traps + SR announcements. Next: PWA, touch viewer controls |
| 29 | Onboarding, marketing, growth | **partial** | ✅ cinematic homepage + login gate. Next: onboarding checklist, pricing page |
| 30 | Quality, polish, continuous improvement | **active** | ✅ golden-path E2E + vitest + this loop. Next: visual regression baselines, Lighthouse CI |

## Worked dimensions (this fire)

### Dimension 1 — State management & UI correctness
Top idea implemented: **authoritative client tombstones** (`DesktopManager.tsx`). A delete tombstones the
id before optimistic removal; every list reconcile filters tombstoned ids → a stale/in-flight/mid-cleanup
poll can never resurrect a deleted computer (the "disappears→reappears→disappears" flicker). Rollback
un-tombstones on a failed delete. Server delete is idempotent. **Status: shipped + build-verified; live
rapid-delete E2E is the next-fire verification.** Runners-up queued: cross-tab `BroadcastChannel`, versioned
real-time sync.

### Dimension 2 — Computer naming & identity
Top idea implemented: **memorable codenames** (`compute/codename.ts`). Curated single-word vocabulary
(celestial/nature/gems/names — offensive/confusing/reserved-free by construction), case-insensitive
owner-scoped uniqueness, numeric-suffix fallback on exhaustion, injectable RNG for deterministic tests
(8 unit tests). Wired into `POST /desktops` (replaces `defaultName`); user names preserved; computer TYPE
stays separate (distro·size·form). `isLegacyGenericName()` gates a safe future backfill. **Status: shipped +
unit-verified + prod-verified (new computer → codename, not "Everyday Desktop").** Deferred P0:
**inline-edit font geometry** — the rename input must match the title's font metrics exactly (zero layout
shift); next fire's lead naming slice (component: the computer card title/input render in `DesktopManager.tsx`).
