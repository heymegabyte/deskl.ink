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
- **M4 + M5 (compute + remote desktop) — GOLDEN PATH LIVE + VERIFIED ✅ (2026-10-04):** deployed to **https://deskl-ink-api.manhattan.workers.dev** (Workers Paid, Containers enabled). Verified end-to-end against the live URL: **spin up** (create+start→`ready`) → **connect via VNC** (noVNC HTML+assets+WebSocket all authenticated) → **visual confirm** (real-browser screenshot shows the rendered deskl.ink XFCE desktop) → **delete** (200, GET→404, list→0). `DesktopContainer`/`DesktopRegistry` DOs, lifecycle API, Ubuntu 24.04+XFCE+TigerVNC+noVNC image (:6080), `VNC_TICKET_SECRET` installed.
  - Proxy fixes that made it work (all in `routes/desktops.ts`): (1) strip the `/vnc` route prefix so websockify resolves noVNC's static root; (2) pass WS upgrades raw (no `switchPort`/`new Request` — both drop the `Upgrade` header); (3) **path-scoped HttpOnly ticket cookie** set on the HTML response so relative asset + ws requests authenticate (noVNC fetches them without `?ticket=`).
  - **SPA now LIVE too (2026-10-04):** `apps/web` served from the SAME worker via Workers Assets (`run_worker_first=["/api/*"]`, SPA fallback) → homepage + desktop-manager + fullscreen VNC all on `https://deskl-ink-api.manhattan.workers.dev`. Verified live: gorgeous homepage renders (screenshot), manager renders real tiles with status + Open/Stop/Delete (screenshot). `+ New computer` now **auto-starts** the container (create→ready in one action — embarrassingly-easy UX). Overlay dismiss got `data-testid="overlay-close"`.
  - **E2E: 5/5 GREEN + deterministic ✅ (2026-10-04)** — `e2e/golden-path.spec.ts` rewritten as ONE cohesive serial test (no flaky cross-test state) keyed on the captured desktop id, waiting on the robust `data-status="ready"` attribute, and confirming the desktop by waiting for noVNC to paint its framebuffer `<canvas>` inside the same-origin iframe. Full UI journey passes against the live URL (homepage→dismiss→`+ New computer`→ready→Open→**desktop canvas renders**→exit→delete→gone), ~9s warm, self-cleaning (0 leaked desktops), console-error-gated. Run: `DESKL_BASE_URL=https://deskl-ink-api.manhattan.workers.dev pnpm -C e2e test`.
  - **Real bug the E2E caught + fixed:** the fullscreen control surface used `pointerEvents:'none'` while idle-hidden, so the VNC iframe swallowed clicks on exit/stop — a user couldn't exit/stop mid-session. Now `pointerEvents:'auto'` always (opacity still fades).
- **Multi-distro picker + real VM sizes (2026-10-05→06):** gorgeous OS popup (Ubuntu default + Fedora/Debian, original brand orbs) selects BOTH distro AND size (Everyday 4 / Developer 6 / Power 8 / Heavy 12 GiB — REAL RAM). Contract-first through `@deskl/shared`.
- **Universal `Computer` DO — architecture keystone, built + deployed as FOUNDATION, flag-gated OFF (2026-10-07):** one `Computer` Durable Object on Cloudflare's **`durable_object` scheduling policy** to collapse the 12 per-(distro × size) classes into ONE that picks image + instance at RUNTIME — making distro/size/form/version/snapshot **data**. Central catalog `workers/api/src/compute/catalog.ts`; a `Lifecycle` adapter in `routes/desktops.ts` selects backend via the `COMPUTER_DO` flag. **Verified live up to container launch, then BLOCKED:** `ctx.container.images` is exposed at runtime (3 keys, string refs) but `start({image,instance})` returns Ok and launches **0 instances** — the multi-image runtime launch/size API isn't confirmable from current docs (ADR-0002 § Blocker). **Live path stays the proven 12-class fleet (flag off); golden path re-verified green.** Flip `COMPUTER_DO=1` to re-test once unblocked. See `docs/adr/0002-durable-object-container-policy.md`. Still unblocks (once live) server form, version selector, persistence/snapshots, idle-stop.
- **Converged product spec + honest status matrix: `docs/product/deskl-converged-spec.md`** — single place for the universal `Computer` model + per-capability Implemented/Foundation/Deferred/Blocked. **Top honest gap: no user auth boundary yet (registry is global, control-plane unauthenticated) — M2 is the #1 P0.**
- **Create rate-limit cost guard (2026-10-07):** interim abuse protection until auth lands — `POST /api/v1/desktops` capped per client IP (6/min) + globally (30/min) via a `rate_limits` table in the registry DO, returning 429 + `Retry-After` BEFORE any container spins up. Counts every POST attempt (incl. malformed). `workers/api` only. Tiles also enriched (created-ago + Persistent/Disposable chip).
- **Browser terminal (ttyd) LIVE for Ubuntu (2026-10-07):** in-session xterm terminal — ttyd on container :7681, proxied under `/api/v1/desktops/:id/term/*` with the same signed ticket as VNC. The DesktopContainer DO's `fetch` routes `/term`→ttyd IN-DO so the terminal WebSocket tunnels through the stub fetch (a WS can't cross DO-RPC → `DataCloneError`; HTTP legs could, the WS couldn't — this was the crux). Toggle + docked panel in the fullscreen view (gated to Ubuntu). **Verified live:** HTML + `/token` + WS `101 (tty)`; golden-path E2E covers toggle→panel; VNC + destroy still green. ttyd image built + run locally first to protect the shared golden-path image. Next: Fedora/Debian ttyd + drop the Ubuntu gate; OpenCode preinstall now has a terminal surface.
- **Auth boundary — server-side ownership LIVE (2026-10-07):** closed the pre-auth hole (anyone controlling any computer). Every request resolves a signed, HttpOnly session **principal** (`deskl_sid`, HMAC — unforgeable; `auth/principal.ts`); registry rows carry an `owner` (additive migration); list is owner-scoped and get/start/stop/ticket/**destroy** authorize actor→resource. **Verified live:** principal B → 404 on principal A's computer (read AND destroy); A controls its own; golden-path E2E green via `page.request` (shared principal). Monitor-safe: per-owner scoping makes the test naturally isolated; `DESKL_ADMIN_TOKEN`/`x-deskl-admin` is an optional ops-sweep bypass (off). **Remaining (M2): identity** — Google/GitHub OAuth + magic link (Better Auth) to upgrade the anonymous principal into an account (blocked on external creds; the seam is in place).
- **Global financial bar LIVE (2026-10-07):** the spec-§39 "what's costing money right now" bar in the app header — running count + estimated hourly burn + session estimate, e.g. `● 1 running · ~$0.04/hr · ~$0.00 est`. Computed from Cloudflare's REAL published rate card (`CF_CONTAINER_RATES` + `estimateDesktopCost` in `@deskl/shared`: memory+disk baseline, active-CPU as an "up to" band) × uptime — honestly an estimate (§43), no fabricated wallet balance (that needs Stripe, M3). Verified live + golden-path E2E asserts it shows "1 running"; rendered on-brand (black/cyan). No external creds, no image rebuild.
- **Tabs — the primary workspace, LIVE (2026-10-07):** the spec-§33 core mental model ("all your computers become tabs"). A persistent top strip: **Home** (the manager grid) + one tab per OPEN computer (distro mark + name + live state dot) + **New**. Opening a computer adds+selects its tab; the active tab's desktop fills everything UNDER the strip (§38). Closing a tab is view-only (never Stop/Destroy, §35); deleting a computer auto-closes its tab. Implemented by lifting open-tab state to `App.tsx` + offsetting the existing `DesktopFullscreen` below the strip (reuse, not rewrite) — all golden-path testids + the monitor-critical desktop view preserved. Golden-path E2E green with the new navigation + a tab assertion; visually on-brand. **Next (§35/§36):** cross-reload restore, drag-reorder, overflow/search, server-tab workspace, per-tab cost/AI/recording badges.
- **"Stop all" cost control + per-computer cost (2026-10-07):** a confirm-gated **"Stop all"** action in the header (spec §40 "stop everything costing money" / §144) stops every RUNNING computer at once; each tile now shows its estimated hourly cost (§103, from the CF rate card). Frontend + existing stop API — no backend/image change. Golden-path E2E asserts the Stop-all control appears while a computer runs; green 2/2.
- **Workspace reliability (2026-10-07):** (1) **noVNC auto-reconnect** — `reconnect=true&reconnect_delay=2000` so a dropped browser connection (network blip / laptop sleep) transparently re-establishes WITHOUT stopping the computer (spec §110). (2) **Cross-reload tab restore (§35)** — open tab ids persist to localStorage + re-fetch owner-scoped on load; lands on Home (no surprise connect). **Verified via a real-browser reload** (create→seed→reload→tab restored as "Everyday desktop"); this caught + fixed a real bug (the persist effect's empty-state `removeItem` was wiping saved ids before restore read them — now captured in a ref at first render). Golden path green throughout.
- **Server form — headless computers, LIVE (2026-10-07):** the Desktop/Server split (spec §9). A lean `container/ubuntu-server` image (Ubuntu + ttyd + git/node/python/ripgrep/tmux/build-essential, NO KDE/VNC — built + verified locally: ttyd 200, tools present) on its own `UbuntuServer` DO class (standard-1, `v5` migration, `DESKTOP_UBUNTU_SERVER` binding). `form:'desktop'|'server'` threads through the contract → create → registry (column + `normalizeForm`) → ticket claims → `desktopNamespace` routing (server → `UbuntuServer`). UI: a **Desktop/Server toggle** in the OS picker + a terminal-native **`ServerWorkspace`** tab (full ttyd + Stop/Exit, §37 "terminal stays dominant") — the monitor-critical desktop VNC path is untouched (separate component). Fully additive (form defaults to desktop). **Next:** server sizes/distros, Files/Ports panels, OpenCode preinstall, Fedora/Debian servers.
- **Browser terminal now on ALL distros (2026-10-08):** removed the Ubuntu-only limitation — added the ttyd static binary + launch block to the Fedora and Debian desktop images (distro-agnostic; built + verified locally: ttyd present in both) and dropped the `distro === 'ubuntu'` UI gate. Every desktop (Ubuntu/Fedora/Debian) now has the in-session terminal. Backlog-completeness win; additive, desktop golden path unaffected.
- **Tab drag-reorder (2026-10-08):** tabs are draggable to reorder (HTML5 DnD in `App.tsx` TabStrip); the existing localStorage persist/restore saves ids in order, so a reordered strip survives reload for free. Frontend-only, additive. Backlog §35 win.
- **Fedora/Debian servers (2026-10-08):** extended the Server form (was Ubuntu-only) to all distros — lean `container/{fedora,debian}-server` images (dnf/apt + ttyd + dev CLIs, no KDE; built + verified locally: ttyd/git/node/python/rg present) on `FedoraServer`/`DebianServer` DO classes (standard-1, `v6` migration). Routing now `server × distro`; the OS picker's Desktop/Server toggle lets a server pick any distro. Additive. Backlog completeness win (parallel to the all-distro terminal).
- **A11y sweep — axe-clean primary surfaces (2026-10-08, §117):** ran axe-core (WCAG 2.0/2.1/2.2 A+AA) against live prod across homepage-overlay / manager / picker and fixed the 2 violations found: `label-content-name-mismatch` (serious — the empty-state launch button showed "New computer" but carried `aria-label="Create your first computer"`; dropped the redundant label) + `page-has-heading-one` (moderate — added context-named `sr-only` `<h1>`s to the manager, desktop-fullscreen, and server-workspace views without disturbing the chrome-light visual language). **Verified live: 0 violations on all three surfaces.** Frontend-only, additive. Partially delivers the M1 "axe-clean" E2E item (line below).
- **Browser security headers — enforcing CSP + hardening, LIVE (2026-10-08, Hard Gate 8):** the a11y sweep exposed that prod served the SPA with **zero** security headers (I could inject axe-core from a CDN straight into the page). Fixed with a two-layer split dictated by Cloudflare: a Workers-Assets `apps/web/public/_headers` file carries an **enforcing** Content-Security-Policy on the SPA document + assets (`script-src 'self'`, no nonce — the built HTML has one external same-origin module) plus HSTS/`X-Frame-Options: DENY`/`frame-ancestors 'none'`/nosniff/`Referrer-Policy`/`Permissions-Policy`/COOP + immutable 1yr asset caching; a Hono middleware stamps the safe subset on **JSON responses only** (so the proxied noVNC `/vnc/*` + ttyd `/term/*` surfaces our iframes embed stay pristine). **Verified live:** document carries the full policy, `/api/v1/version` the safe subset with NO CSP, app renders clean under enforcement (0 breaking console errors), and the CDN script-injection is now **refused** (`script-src-elem` violation). `_headers` documents the exact directives to widen when Stripe/PostHog land. See decision **D13**.
- **Observability — request correlation + structured logging, LIVE (2026-10-08):** closed the `drift-detection` "logs without correlation IDs" gap. A `requestLogger()` Hono middleware (mounted first) mints/propagates an `x-request-id` (inbound honored when sane, else a fresh UUID), echoes it on the response, and emits ONE structured JSON line per control-plane request (`ts/level/requestId/cf-ray/method/path/status/durationMs/owner/desktop/environment`); `principalOf` threads the owner in. The WS tunnels (`/vnc/*`, `/term/*`) are skipped from response-mutation + per-request logging (a header on a `101` breaks the socket); all logging is `try/catch`ed. **Verified live:** header minted/honored/sanitized/unique + real structured lines via `wrangler tail` (owner + ray populated); golden-path green. Foundation for the `@sentry/cloudflare` baseline once a DSN lands. See decision **D14**.
- **Rename a computer — full-stack CRUD, LIVE (2026-10-08):** closed a real gap (computers were stuck with auto-generated names) + a spec-listed M4 tile action. Metadata-only `PATCH /api/v1/desktops/:id` ({ name }, Zod-trimmed 1–60), owner-scoped in the registry (`rename(id, name, owner?)` — foreign/unknown id → 404, same non-leak as `getOwned`; admin unscoped path), allowed in any state, never touches the container. UI: keyboard-reachable inline tile edit (pencil → input; Enter/blur commit, Esc cancels; optimistic + revert). New `e2e/rename.spec.ts` (create → inline rename → **persists across reload**). **Verified live:** API probe round-trips; empty→400/foreign→404; rename spec green; golden-path + a11y unregressed. (Re-hit the D12 DO code-propagation lag — a new DO *method* also waits for the warm singleton to evict; correct after the ~100s window.) See decision **D15**.
- **Command palette (⌘K) — fast keyboard nav, LIVE (2026-10-08, §87):** ⌘K/Ctrl+K opens a searchable overlay of every computer (jump straight to one) + New/Home/Sign-out. ⌘K deliberately (⌘N/⌘W/⌘1-9 collide with browser-reserved keys). `CommandPalette.tsx` is self-contained + DECOUPLED — fetches its own owner-scoped list, calls App's existing `openDesktop`/`goHome`/`reopenOverlay`, so it touches ZERO monitor-critical manager/VNC code; manager goes `inert` while open. "New computer" opens the real picker via a tiny additive `openPickerSignal` nonce. Full keyboard nav + editable-combobox/listbox ARIA. New `e2e/command-palette.spec.ts` (container-free). **Verified live:** spec green; golden-path + a11y + rename unregressed. The console-gated spec also **caught + fixed a latent CSP regression** (font `connect-src`, D13 amendment). v1 omits state-mutating Stop/Stop-all (want a shared store first). See **D16**.
- **Self-hosted fonts — dropped the Google origin, tighter CSP, LIVE (2026-10-08):** replaced the Google Fonts `<link>` with 10 same-origin latin-subset woff2 (Sora/Space Grotesk/JetBrains Mono, 272K, `public/fonts/*`, immutable-cached) + `src/fonts.css` (@font-face copied verbatim from Google's css2 for exact glyph coverage; `font-display: swap`). index.html preloads the two above-the-fold faces. CSP tightened: `style-src`/`font-src`/`connect-src` all back to `'self'` (no google/gstatic) — removing the third-party dependency (privacy + perf + offline) AND the connect-src font bug class from the palette fire. **Verified live:** CSP has no google origin; fonts same-origin + ZERO Google requests; `document.fonts` loaded + identical typography (screenshot); 0 console errors; full suite green. Supersedes the D13 band-aid. See **D17**.
- **Installable PWA — manifest + app shortcut, LIVE (2026-10-08):** deskl.ink installs to the dock/home screen (on-brand for "a desktop for you"). `manifest.webmanifest` (standalone, theme/bg #05060A, any+maskable SVG icons, categories) + a hand-authored full-bleed `icon-maskable.svg` + apple-mobile-web-app meta (iOS A2HS). Manifest-only — no service worker (not required for install since Chrome 108/112, verified first-party); SVG icons are resolution-independent so no raster generation needed. The manifest "New computer" shortcut launches `/?new=1` → App enters the app + opens the picker + strips the param. `_headers` serves `.webmanifest` as `application/manifest+json`. New `e2e/pwa.spec.ts` (manifest valid/served/icons-resolve + shortcut). **Verified live:** manifest 200 + all fields; `/?new=1` opens picker; 0 console errors; full suite green. Follow-ups: offline service worker, raster icons for Android splash. See **D18**.
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
- [~] Observability: structured logs, request/desktop/session IDs, lifecycle + latency metrics, OOM, recording failures, billing reconciliation, idle-stop success; internal diagnostics page; no secrets in telemetry — **foundation shipped 2026-10-08** (per-request structured JSON + `x-request-id` correlation + cf-ray + owner/desktop ids + latency; see snapshot/D14). Remaining: Sentry (`@sentry/cloudflare`, needs DSN), lifecycle/OOM/billing/idle metrics, diagnostics page.
- [ ] Failure-recovery test matrix (see M5/M6 + Stripe webhook replay, duplicate create, double stop, simultaneous start, auth lost while connected). Lifecycle idempotent.
- [ ] IaC: wrangler config, R2/D1/DO/Container setup scripts, Dockerfiles, deploy scripts, `.env.example`, Stripe + auth-provider setup checklists. Automate setup over dashboard steps.
- [ ] Golden-path E2E (the 26-step dogfood flow in the product brief) — the definition of done.

## Research gates (verify BEFORE locking — see ADR-0001)

- [x] Cloudflare Containers + Durable Object Container API (current) — M4 — **verified + adopted the `durable_object` scheduling policy (ADR-0002, 2026-10-07)**. Follow-up: once `Computer` is proven stable in prod, remove the 12 legacy `default`-policy classes via a `deleted_classes` migration + delete `DesktopContainer.ts`.
- [ ] Better Auth on CF Workers + D1 (current compatibility) — M2
- [ ] noVNC / TigerVNC vs KasmVNC/WebRTC — M5
- [ ] restic + R2 S3 compatibility (or alternative content-addressed engine) — M6
- [ ] Install Doctor current capabilities + headless profile conventions — M4
- [ ] Superset standalone headless install mechanism (current) — M4
- [ ] Current CF limits/pricing for PricingService — M3
