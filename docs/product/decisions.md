# deskl.ink — Decision Ledger

Canonical record of consequential product/architecture decisions (per the DeskLink spec §136).
Newest first. Each: **Decision · Alternatives · Rationale · Evidence · Date · Status · Confidence ·
Reconsider when**. ADRs hold the long form; this is the index + the calls that aren't full ADRs.

Status: `active` (in force) · `interim` (deliberate stopgap) · `blocked` (needs an external unblock) ·
`superseded`. Confidence: high / medium / low.

---

### D12 — Server form = a distinct lean image + class + terminal workspace (not desktop-with-VNC-hidden)
- **Decision:** Implement the headless `server` form (§9) as a SEPARATE lean image
  (`container/ubuntu-server`: ttyd + dev CLIs, no KDE/VNC) on its own `UbuntuServer` DO class, with
  a terminal-native `ServerWorkspace` tab — NOT a desktop computer with the VNC view swapped. `form`
  threads the contract → registry → ticket → routing; defaults to `desktop` (fully additive).
- **Alternatives:** (a) server = desktop image, UI hides VNC + shows terminal (violates §9
  explicitly; wastes a KDE image's RAM/boot on a headless box); (b) wait for the Computer DO to
  unblock so form is pure data (blocked — see D6); (c) put server behind a flag (unnecessary — it's
  additive + the desktop path is untouched).
- **Rationale:** §9 is emphatic that Server "deserves a server-native workspace." A lean image boots
  faster + costs less, and a terminal-first tab is the right surface for OpenCode/agents/ports.
  Reused the proven `/term` proxy + a separate `ServerWorkspace` so the monitor-critical desktop view
  is untouched.
- **Evidence:** Verified live end-to-end (real browser): server create → `form:'server'` →
  terminal-native `ServerWorkspace` with the ttyd iframe + **no VNC viewport**; image built locally
  (ttyd 200, git/node/python/rg present); desktop golden path green.
- **Lesson:** a registry **DO schema change (`ALTER TABLE ... form`) + new column don't take effect
  until the hot singleton DO evicts/cold-starts** — right after deploy, creates hit the old code and
  `form` read back as `desktop`. Correct after the eviction window. Factor this into post-deploy
  verification of DO-schema changes.
- **Date:** 2026-10-07 · **Status:** active (Ubuntu server, everyday size) · **Confidence:** high
- **Reconsider when:** the Computer DO unblocks (D6) → form becomes pure data (one class, image
  chosen at runtime); add server sizes/distros + Files/Ports + OpenCode preinstall as additive.

### D11 — Tabs = the primary workspace; "Home" is the grid; close ≠ stop
- **Decision:** Adopt the spec-§33 model — every OPEN computer is a tab in a persistent top strip;
  "Home" (leftmost) is the manager grid. The active tab's desktop fills everything under the strip
  (§38). Closing a tab removes the VIEW only (never Stop/Destroy, §35); deleting a computer
  auto-closes its tab. Implemented by lifting open-tab state to `App` + offsetting the existing
  `DesktopFullscreen` below the strip (reuse, not rewrite).
- **Alternatives:** (a) keep the single-fullscreen-overlay model (can't hold multiple computers —
  contradicts the product's core mental model); (b) a full window-manager (splits/detach/groups) now
  (over-built — §36 says architect-for, don't build-all); (c) mount every open tab's VNC live
  (resource blowup, §118) — current impl mounts only the active desktop (switching re-opens).
- **Rationale:** "All your computers become tabs" (§33/§144) is the product's spine; every later
  surface (server tabs, joined machines, per-tab cost/AI/recording) hangs off it. Reusing
  DesktopFullscreen kept the monitor-critical desktop view + all testids intact.
- **Evidence:** Golden-path E2E green with the new navigation (Open→tab→desktop-under-strip→exit→
  Home→delete→tab auto-closes); visual check shows the strip + KDE desktop below it, on-brand.
- **Date:** 2026-10-07 · **Status:** active (core) · **Confidence:** high
- **Reconsider when:** adding cross-reload restore (needs re-fetch of tab ids), background-tab
  display pausing (§34), or splits/detach (§36) — all additive to this model.

### D10 — Live cost = estimate from CF's real rate card (no fictional rates; wallet needs Stripe)
- **Decision:** Ship the mandated global financial bar (§39) NOW as an ESTIMATE computed from
  Cloudflare's published Containers rate card (`CF_CONTAINER_RATES`) × each running computer's
  allocation + uptime (`estimateDesktopCost`). Show running count + hourly burn + session estimate;
  do NOT show a wallet balance (needs Stripe) — an absent number beats a fabricated one.
- **Alternatives:** (a) wait for Stripe + a metered ledger before showing any cost (leaves the
  mandatory §39 bar empty indefinitely); (b) hard-code per-size dollar rates (violates §42
  "no fictional values"); (c) show only resource facts, no $ (less useful; the rates ARE knowable).
- **Rationale:** §42 forbids fictional rates, but the CF per-unit rates ARE public, so an honest
  estimate is buildable today. Baseline (memory+disk) accrues deterministically while running; CPU
  is activity-dependent, shown as an "up to" band — truthful per §43 (Estimated state).
- **Evidence:** Rates from developers.cloudflare.com/containers/platform/pricing (2026-10). Live:
  standard-1 → ~$0.04/hr baseline. Golden-path E2E asserts the bar shows "1 running".
- **Date:** 2026-10-07 · **Status:** active (estimate) / wallet+ledger deferred · **Confidence:**
  high (baseline math) / medium (CPU utilization unknown → shown as a band, not a point).
- **Reconsider when:** the usage ledger + CF usage telemetry land (M3) → replace the estimate with
  metered → reconciled → finalized states (§43); add wallet balance once Stripe is wired.

### D9 — Auth boundary: anonymous signed-session principal + per-owner authorization (identity later)
- **Decision:** Enforce server-side ownership NOW via an anonymous, HMAC-signed session principal
  (`deskl_sid` HttpOnly cookie); every computer has an `owner`; list is owner-scoped and every
  per-id route authorizes actor→resource. Defer real user IDENTITY (OAuth/magic-link) to an upgrade
  of that principal. Optional `ADMIN_TOKEN` + `x-deskl-admin` for ops bypass.
- **Alternatives:** (a) wait for full OAuth before any authz (leaves the open-tenant hole until
  external creds exist — unacceptable); (b) per-principal registry DO instead of an owner column
  (cleaner isolation but breaks the monitor sweep's enumeration — rejected); (c) no auth + rely on
  rate-limit only (doesn't stop cross-tenant access).
- **Rationale:** The biggest security gap was authZ (anyone controlling any computer), not authN.
  AuthZ is unblocked without external creds; a signed anonymous principal is a real ownership
  boundary and the exact seam OAuth later upgrades. Ships value now, de-risks later.
- **Evidence:** Verified live — principal B gets 404 on principal A's computer for GET AND DELETE;
  A controls its own; golden-path E2E green with `page.request` (shared principal). Monitor-safe:
  per-owner scoping makes the test naturally isolated.
- **Date:** 2026-10-07 · **Status:** active (authz) / deferred (identity) · **Confidence:** high
- **Reconsider when:** OAuth/magic-link lands → the principal gains a real account id (same owner
  model); consider per-principal registry sharding only if the single global registry DO becomes a
  hotspot at scale.

### D8 — Browser terminal via ttyd, subpath-proxied, Ubuntu first
- **Decision:** Ship an in-session browser terminal using the `ttyd` static binary (xterm.js over
  HTTP+WS on container port 7681), proxied by the Worker under `/api/v1/desktops/:id/term/*` with
  the SAME signed-ticket auth as VNC. Ubuntu image first; Fedora/Debian follow.
- **Alternatives:** gotty (less maintained); a bespoke WS↔PTY service (more code); rely on the VNC
  desktop's Konsole (not a first-class web terminal; no server-form path).
- **Rationale:** ttyd is purpose-built, tiny, and designed for reverse-proxy subpaths (relative
  `token`/`ws`). A VNC desktop user already has a shell, so the terminal adds no privilege — it's
  gated by the same desktop-scoped ticket. It's also the prerequisite surface for Server form +
  OpenCode.
- **Evidence:** Local docker build + run confirmed ttyd serves a single self-contained HTML (no
  absolute asset paths), `/token`→200, and WS only at `/ws` (nested paths refused) — so the proxy
  must strip the prefix. WS-through-proxy verified in prod (see status).
- **Key implementation fact:** the terminal WS MUST be proxied inside the DO (the DesktopContainer
  `fetch` override routes `/term`→ttyd via in-DO `containerFetch`), NOT via a `containerFetch` RPC
  from the Worker — a WebSocket cannot be returned across the DO-RPC boundary (`DataCloneError`).
  Only the stub's `.fetch()` tunnels a WS. (Same reason the VNC WS goes through `.fetch`.)
- **Date:** 2026-10-07 · **Status:** active (Ubuntu) — verified live (HTML + token + WS `101`),
  golden-path E2E covers it · **Confidence:** high
- **Reconsider when:** a native DeskLink stream lands (could host a terminal channel too), or ttyd
  maintenance lapses. Next: add ttyd to Fedora/Debian images + drop the Ubuntu-only UI gate.

### D7 — No user auth yet → interim create rate-limit as the cost-abuse backstop
- **Decision:** Ship a fixed-window rate limit on `POST /api/v1/desktops` (per-IP 6/min + global
  30/min, in the registry DO) returning 429 before any container launches. It is a BACKSTOP, not a
  substitute for the real auth boundary (still the #1 P0).
- **Alternatives:** do nothing until auth (unbounded billable-container DoS risk); Cloudflare
  rate-limiting rules (less app-aware, another moving part); Turnstile on create (friction, still no
  identity).
- **Rationale:** There is no identity yet, so an unauthenticated caller could spin up unbounded
  billable containers. A cheap worker-only guard closes the biggest cost hole now without touching
  the monitor/golden path.
- **Evidence:** Verified in prod — 6 allowed then 429 (Retry-After ~48s), 0 containers created.
- **Date:** 2026-10-07 · **Status:** interim · **Confidence:** high
- **Reconsider when:** the auth boundary + per-principal ownership lands (then rate-limit becomes a
  secondary defense, not the primary one).

### D6 — Universal `Computer` on the `durable_object` container policy (adopted as DIRECTION, blocked)
- **Decision:** Collapse the per-(distro × size) container-class matrix into ONE `Computer` DO that
  selects image + instance at runtime (CF `durable_object` scheduling policy). Full ADR-0002.
- **Alternatives:** keep the 12-class matrix (doesn't scale to form × version × snapshot); a non-CF
  provider (abandons CF-native leverage).
- **Rationale:** Makes distro/size/form/version/snapshot **data**, not classes; unlocks Server form,
  version selection, persistence/snapshots.
- **Evidence:** Deploys + binding + `ctx.container.images` runtime map all verified; BUT
  `start({image,instance})` launches **0 instances** (`wrangler containers list`), and current public
  docs don't document the multi-image runtime launch call. **Blocked.**
- **Date:** 2026-10-07 · **Status:** blocked (flag-gated OFF via `COMPUTER_DO`; live path = 12-class
  fleet) · **Confidence:** high (that it's the right direction); low (that the launch API is as first
  assumed)
- **Reconsider / unblock when:** CF's newest `durable_object` docs/support confirm the launch +
  instance-size call. Repro in ADR-0002 § Blocker.

### D5 — Live compute path is the 12-class `default`-policy fleet (interim, until D6 unblocks)
- **Decision:** Keep the 3 distros × 4 sizes = 12 container DO classes as the LIVE path; route via a
  `Lifecycle` adapter gated by `COMPUTER_DO` (off = fleet, on = Computer DO).
- **Alternatives:** cut over to the Computer DO now (broken — 0 instances); drop sizes/distros to
  shrink the matrix (worse product).
- **Rationale:** It works (golden path green); the adapter makes the eventual cutover a flag flip.
- **Date:** 2026-10-06/07 · **Status:** interim · **Confidence:** high
- **Reconsider when:** D6 unblocks → cut over, then delete the 12 classes via a `deleted_classes`
  migration.

### D4 — Remote display = TigerVNC + noVNC + websockify for v1
- **Decision:** v1 remote desktop is TigerVNC (loopback, no VNC password) + noVNC + websockify on
  :6080, WS-proxied through the Worker with a signed ticket + path-scoped cookie.
- **Alternatives:** KasmVNC, WebRTC, a native DeskLink stream — all deferred behind a remote-display
  adapter boundary (ADR-0001 gate 3).
- **Rationale:** Standards-compatible, simplest thing that renders a real desktop in-browser; good
  enough for CF Linux desktops initially. Benchmark natives before migrating.
- **Evidence:** Golden path green (framebuffer paints) across many monitor fires.
- **Date:** 2026-10-04 · **Status:** active · **Confidence:** high
- **Reconsider when:** measured latency/quality on joined machines justifies a native/WebRTC adapter.

### D3 — Qubes / macOS / Windows are NOT CF-container desktops
- **Decision:** Do not offer Qubes/macOS/Windows as CF-container desktops; only Linux-kernel distros.
  (The spec's broader vision of joining such machines is a SEPARATE agent-based path, not containers.)
- **Alternatives:** fake cards (violates the truth rule); a separate non-CF VM/Apple-HW tier (large,
  non-CF-native) — deferred to the "joined computer" roadmap, not cloud-provisioned.
- **Rationale:** Qubes = bare-metal Xen (needs IOMMU/nested-virt CF doesn't expose); macOS = Darwin +
  Apple-HW EULA; Windows = NT kernel (needs a full VM). Containers share the host Linux kernel.
- **Date:** 2026-10-06 · **Status:** active · **Confidence:** high
- **Reconsider when:** building the P1 "join an existing computer" agent path (those OSes arrive as
  JOINED machines via `desklinkd`, never as CF containers).

### D2 — Cloudflare-native, no portability layer
- **Decision:** Reach for CF primitives directly (Workers/DO/Containers/R2/D1/WS). Full ADR-0001.
- **Status:** active · **Confidence:** high · **Date:** 2026-10-03
- **Reconsider when:** CF can't meet a hard requirement (then add a provider adapter — already the
  shape of the `ComputeProvider` seam — not a portability layer).

### D1 — Repo + branch policy: work on local `main`, never push `origin/main`
- **Decision:** Commit verified slices to local `main`; never push `origin/main` (it's a live
  **emdash** mirror, unrelated). emdash backup preserved at tag `archive/emdash-v0.4.15`.
- **Status:** active · **Confidence:** high · **Date:** 2026-10-03
- **Reconsider when:** deskl.ink gets its own dedicated remote (then push there).
