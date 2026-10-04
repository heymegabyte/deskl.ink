# deskl.ink — Build Ledger

> **A desktop for you. A computer for your AI.**
> Instantly available, browser-accessible Linux workstations operable by a human, an AI agent,
> many cooperating agents, or a human + AI together. Cloudflare-native.

This is the durable backlog. The build drains it **one verified vertical slice per loop** — never
a shallow sweep across everything (per `split-work-into-ledger`). `[ ]` queued · `[~]` in progress ·
`[x]` shipped + verified. Keep this file the single source of truth for scope; update it the same
turn work lands.

---

## Status snapshot (2026-10-03)

- **Repo founded.** emdash backup preserved at tag `archive/emdash-v0.4.15`. deskl.ink lives on branch `deskl-ink-foundation` (origin/main is a live emdash mirror — see memory).
- **M1 (beautiful shell)** — `[x]` monorepo + black/cyan tokens + homepage overlay + lazy WebGL hero + Worker skeleton. Builds green.
- **M4 + M5 (compute + remote desktop) — code slice BUILT, verified green (`[~]`, deploy pending):** `DesktopContainer`/`DesktopRegistry` Durable Objects (`@cloudflare/containers`), lifecycle API (create/list/status/start/stop/**delete**), HMAC-ticket-gated VNC WebSocket proxy, Ubuntu 24.04 + XFCE + TigerVNC + noVNC image (listens :6080), desktop-manager UI (`+ New computer` → tiles → Open/Stop/Delete), fullscreen noVNC route + tiny control surface, and the **golden-path Playwright E2E** (create→ready→VNC→visual-confirm→delete) written TDD-RED.
  - **BLOCKED on deploy prereqs** (the golden path can't go live until): Docker daemon running (CF builds the image locally on `wrangler deploy`), **Workers Paid plan + Containers enabled** on the CF account, `wrangler` auth, and `wrangler secret put VNC_TICKET_SECRET`. The loop drains these next fires.
- Shared contract: `packages/shared/src/desktop-api.ts` (Zod SSOT for server + client + E2E).
- Other milestones `[ ]` queued below.

---

## Architecture (see `docs/adr/0001-platform-architecture.md`)

```
Browser ─▶ CF Worker (Hono, auth/API) ─▶ Durable Object (one per desktop: lifecycle/state/coord)
                                              └─▶ Cloudflare Container (Ubuntu workstation runtime)
R2  = durable truth (persistence backups, screenshots, recordings, exports, AI-memory artifacts)
D1  = relational account/app data (users, desktops, sessions, usage ledger, templates, shares)
DO storage = small authoritative per-desktop coordination state
```

Monorepo (pnpm workspaces):

```
apps/web            React 19 + Vite + Tailwind v4 — homepage overlay, desktop manager, fullscreen VNC route
workers/api         CF Worker (Hono) — auth, billing, lifecycle, control-plane, MCP, API v1
workers/*-do        Durable Objects — DesktopDO (lifecycle/coord/billing heartbeat/activity)
container/ubuntu    OCI image — XFCE + Install Doctor profile + VNC + desklink-agent daemon
packages/shared     Design tokens + shared TS types
packages/schemas    Zod schemas (single source of truth) → OpenAPI + typed clients
packages/desklink   Control-plane client (used by API, MCP, automations)
mcp/                DeskLink MCP server (capability-scoped, same API surface)
container/agent     desklink-agent — in-container daemon (control, recording, persistence, activity)
```

---

## M1 — Beautiful shell `[~]`

- [~] pnpm monorepo foundation (root configs, workspaces, strict TS, lint/format)
- [~] `@deskl/shared` design tokens — black `#05060A` / near-black / electric cyan `#00E5FF` / violet accent / restrained white; glass, bloom, motion, type (Sora / Space Grotesk / JetBrains Mono)
- [~] `apps/web` Vite + React 19 + Tailwind v4 app shell that builds
- [~] Homepage **overlay** (full-screen, layered above app): left ~62% product experience · right ~38% auth panel · elegant dismiss **X** · responsive mobile · dismissal remembered per session
- [~] WebGL hero mount point + graceful fallback (static gradient, reduced-motion, no-WebGL)
- [~] `workers/api` Hono skeleton (`/health`, `/api/v1/version`) + `wrangler.toml` with commented bindings
- [ ] **Cinematic WebGL hero scene** (dedicated slice): dark infinite environment, floating luminous Linux workstations connected by cyan pathways, one active desktop approaching, human + AI cursors moving between nodes, windows showing Chrome/terminal/editor/agent/timeline. Cursor-reactive. Lazy-loaded. FPS-monitored.
- [ ] Locked read-only app shell behind overlay for unauthenticated users + obvious sign-in affordance
- [ ] Reopen-homepage control from within the app
- [ ] Playwright E2E: homepage renders, WebGL present or fallback, dismiss/reopen, 6 breakpoints, axe-clean
- [ ] Deploy web + API to real URLs; verify live

## M2 — Identity `[ ]`

- [ ] Research + ADR: Better Auth on CF Workers + D1 (vs alternatives) — confirm current CF compatibility
- [ ] `packages/schemas` Zod + env validation (`@t3-oss/env-core` style)
- [ ] D1 schema + Drizzle migrations: users, accounts, sessions, oauth links, verification
- [ ] Better Auth wired: GitHub OAuth, Google OAuth, email magic link (Resend)
- [ ] Secure HTTP-only cookies, CSRF, state/nonce, session rotation, safe redirect allowlist, rate limiting
- [ ] OAuth account linking (one user ↔ many providers)
- [ ] **5-minute SSO threshold**: track cumulative billable minutes; at ~4 min notify; at 5 min checkpoint + stop billable compute + show OAuth verify UI + resume after GitHub/Google. One-time, never re-auth loop. Never destroy work.
- [ ] Right-panel auth UI wired to real flows (replaces M1 no-op handlers)
- [ ] Tests: auth flows, linking, 5-min enforcement state machine

## M3 — Billing `[ ]`

- [ ] Stripe **test mode** integration (secrets via env, never committed); webhook signature verify
- [ ] Customer creation + payment-method setup (SetupIntent) + billing portal
- [ ] **PricingService** abstraction — rates derived from real CF pricing/config, centrally updatable (NO hard-coded fictional values)
- [ ] Usage ledger (D1): desktop runtime, storage, recording storage, managed-AI (separate category)
- [ ] Hard account spend limits + configurable alerts + invoice/usage history
- [ ] **Live cost meter** — tiny upper-right `● REC  $0.037  ◉`, ~live update; hover/click reveals session cost, runtime, compute, storage, recording, AI, hourly rate, balance/budget, link to detail
- [ ] Tests: webhook replay/out-of-order/idempotency, metering math, limit enforcement

## M4 — Actual computer `[ ]`

- [ ] Research + ADR: Cloudflare Containers + **Durable Object Container API** (current docs), `standard-1` 4 GiB, linux/amd64
- [ ] `DesktopDO` Durable Object: lifecycle, status state machine, concurrency, connection coord, last-meaningful-activity, billing heartbeat, persistence state, active controller, observers, task/recording state, recovery metadata
- [ ] `container/ubuntu` OCI image: Ubuntu + XFCE (evaluate vs alternatives), auto-login graphical session (no login screen), deskl.ink theming
- [ ] **Install Doctor** deskl.ink cloud-workstation profile (`HEADLESS_INSTALL=true`, Standard-Desktop group) — do NOT hand-roll giant apt scripts
- [ ] Batteries-included tooling (Chrome/Firefox, git, gh, node/pnpm/bun, python/uv, go, rust, ripgrep/fd/fzf/jq/yq, ffmpeg/imagemagick, Playwright deps, db/cloud CLIs, coding agents). Android et al. installable on demand, not in base.
- [ ] **Superset** standalone headless preinstalled (`superset start`), no subscription creds baked in
- [ ] Desktop manager UI: `+ New computer`, friendly sizes (4 GB Everyday / 6 Developer / 8 Power / 12 Heavy) with exact resources + price in advanced; tiles (name/OS/status/screenshot/RAM/uptime/cost/last-active/persistent/agent/recording); actions (Open/Start/Stop/Duplicate/Create-from/Rename/Upgrade/Export/History/Share/Destroy — **Stop** not Pause)
- [ ] Create/start/stop a 4 GiB Ubuntu desktop — near-instant create
- [ ] First-run: auto-provision default persistent Ubuntu OR single dominant `Create my Ubuntu computer`
- [ ] Tests: DO lifecycle state machine, idempotent create/stop/start, double-stop, concurrent-start

## M5 — Remote desktop `[ ]`

- [ ] Research + ADR: TigerVNC + noVNC (vs KasmVNC/WebRTC) for v1
- [ ] Secure WS proxy through Worker → DO → container; **never** public unauthenticated VNC; short-lived scoped connection authz
- [ ] Fullscreen desktop route (code-split; NO WebGL homepage deps loaded here); near-every-pixel Linux
- [ ] Tiny top-right chrome: recording indicator · live cost · connection/status · agent status · overflow menu (exit fullscreen, switch/stop/create computer, human/AI control, clipboard, upload/download, quality, recordings, sharing, usage, terminal, disconnect). Auto-hide when idle.
- [ ] Reconnect: browser refresh / dropped WS must NOT stop the computer; reconnecting/restored states; quality adaptation; mobile-network tolerant
- [ ] Tests: refresh mid-session, WS interruption, forged-connection rejection

## M6 — Persistence `[ ]`

- [ ] Research + ADR: **restic → R2 (S3-compatible)** vs equivalent content-addressed (chunk dedup, integrity, encryption, atomic manifests, resumable, deterministic restore, versioned)
- [ ] R2 = durable truth; container disk = ephemeral; CF snapshots = acceleration cache only (not sole recovery)
- [ ] Explicit include/exclude rules; `.gitignore` as a SIGNAL not a delete policy (keep `.env`, local DBs, creds, user-created ignored files)
- [ ] Graceful pre-stop: flush/close Chromium, checkpoint Firefox, flush SQLite, `sync`, signal user services, finalize recording, write manifest, verify integrity. Handle `SIGTERM` (CF can rehome containers)
- [ ] Persist: home, Chrome/Firefox profiles+extensions+settings, git repos, SSH (user's), IDE + AI-tool config, shell config/history, user apps, meaningful `/etc` + `/usr/local` + `/opt`, app DBs, desktop prefs. Skip unchanged OS files.
- [ ] Background checkpoints + final checkpoint on stop; restore onto a replacement host independent of CF snapshot
- [ ] **10-minute idle auto-stop** — meaningful activity = human input / VNC interaction / authorized Computer Use / MCP activity / active agent task / explicit foreground keepalive (not meaningless polling). At threshold: indicate stopping → block new tasks → flush → persist → finalize recording → verify durable checkpoint → stop container → stop billing → retain metadata/screenshots/history
- [ ] **Never report "Stopped safely" before the durable checkpoint is confirmed**
- [ ] Tests: persistence round-trip across container REPLACEMENT, interrupted write, failed restore, R2 transient failure

## M7 — DeskLink Memory `[ ]`

- [ ] Session layout: `metadata.json · timeline.jsonl · actions.jsonl · ocr.jsonl · screenshots/ · video/ · artifacts/ · summaries/ · indexes/`
- [ ] Segmented efficient video (evaluate WebM/VP9/AV1/H.264) + desktop audio; incremental R2 upload (never lose all on crash)
- [ ] Smart screenshots: periodic + before/after action + visual-change/perceptual-hash dedup; WebP/AVIF; keyframes. Triggers: click, navigation, dialog, active-window change, error, agent action, human takeover, page transition, meaningful delta
- [ ] Async OCR (modular engine, local + future vision model): text + timestamp + screenshot ref + bbox + confidence + dims + window context; searchable
- [ ] AI-readable timeline schema (actor/application/url/visibleText/action/before+after screenshot/result)
- [ ] Security: never store plaintext passwords/keystroke secrets/tokens/secret clipboard; recordings = highly sensitive, encrypt/authorize
- [ ] Retention: default 30 days; pin indefinitely / delete now / extend / export / share-with-permission; R2 lifecycle so storage can't grow forever; show storage impact + cost
- [ ] Playback + searchable history UI
- [ ] Tests: screenshot dedup, OCR search finds known text, crash-before-finalize recovery

## M8 — Computer API + MCP `[ ]`

- [ ] DeskLink control API: screenshot, pointer move/click/dblclick/rclick/drag/scroll, type, key chords, clipboard (authz), screen size, active window metadata, OCR, upload/download, fs ops, process inspect/exec, terminal exec, browser-aware automation, connection status, start/stop, resource info
- [ ] Both visual Computer Use AND richer native interfaces (don't force an AI to click a terminal if it has safe native `exec`)
- [ ] Granular capabilities/scopes; API keys; audit privileged actions; rate limits
- [ ] Human + AI control: one active controller + many observers + safe background agents; human takeover wins immediately; no two pointer-controllers fighting; request/stop/resume control; task progress; non-intrusive AI presence
- [ ] **DeskLink MCP** server on same API: `desktop.list/create/start/stop/destroy/status/screenshot/observe/click/type/scroll/key/exec/files.*/upload/download/recordings.*/timeline.*/share/cost`. Capability-based auth (no overly-broad single token). Rich MCP resources for screenshots/history/files/recordings
- [ ] OpenAPI spec generated from Zod; typed clients
- [ ] Tests: MCP/API contract, scope enforcement, controller arbitration, Computer Use round-trip

## M9 — Automate what I did `[ ]`

- [ ] Recorded session → editable automation/workflow from screenshots + OCR + actions + browser/terminal/native events + files + timing + repeated patterns
- [ ] Replay visually AND via reliable native APIs when available; parameterize inputs; ask for missing vars; semantic targets over raw pixels (never promise perfect pixel replay)
- [ ] Run on this desktop / disposable clone; schedulable; invokable via API/MCP; produces evidence/results
- [ ] Tests: capture→workflow synthesis, parameterization, replay on clone

## M10 — Fleets / templates / disposable `[ ]`

- [ ] Disposable computers: TTL 1h/6h/24h/7d with clear remaining-lifetime; `Keep this computer` → convert to persistent; no auto-inherited sensitive creds
- [ ] Create-from / Save as template / Start disposable copy / Start clean copy; explicit credential include/exclude on clone; never copy secrets into public/shared templates
- [ ] Template manifests supporting personal / org / public curated templates
- [ ] **Agent fleets** backend model (Create 5 / 10, task-per-desktop, agent-per-desktop, parallel jobs, pooled budget, fleet stop/destroy/history) — design backend so fleets are natural, keep initial UI simple
- [ ] Tests: clone credential controls, disposable expiry, fleet create/stop

---

## Cross-cutting (every milestone)

- [ ] Security threat model (hostile tenant, passwordless sudo inside workstation, tenant escape, billing abuse, recording exfil, forged VNC, token leak, OAuth abuse). No infra master secrets in desktop; scoped brokers only.
- [ ] Observability: structured logs, request/desktop/session IDs, lifecycle + latency metrics, OOM, recording failures, billing reconciliation, idle-stop success; internal diagnostics page; no secrets in telemetry
- [ ] Failure-recovery test matrix (see M5/M6 + Stripe webhook replay, duplicate create, double stop, simultaneous start, auth lost while connected). Lifecycle idempotent.
- [ ] IaC: wrangler config, R2/D1/DO/Container setup scripts, Dockerfiles, deploy scripts, `.env.example`, Stripe + auth-provider setup checklists. Automate setup over dashboard steps.
- [ ] Golden-path E2E (the 26-step dogfood flow in the product brief) — the definition of done.

## Research gates (verify BEFORE locking — see ADR-0001)

- [ ] Cloudflare Containers + Durable Object Container API (current) — M4
- [ ] Better Auth on CF Workers + D1 (current compatibility) — M2
- [ ] noVNC / TigerVNC vs KasmVNC/WebRTC — M5
- [ ] restic + R2 S3 compatibility (or alternative content-addressed engine) — M6
- [ ] Install Doctor current capabilities + headless profile conventions — M4
- [ ] Superset standalone headless install mechanism (current) — M4
- [ ] Current CF limits/pricing for PricingService — M3
