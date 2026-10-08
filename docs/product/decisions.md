# deskl.ink — Decision Ledger

Canonical record of consequential product/architecture decisions (per the DeskLink spec §136).
Newest first. Each: **Decision · Alternatives · Rationale · Evidence · Date · Status · Confidence ·
Reconsider when**. ADRs hold the long form; this is the index + the calls that aren't full ADRs.

Status: `active` (in force) · `interim` (deliberate stopgap) · `blocked` (needs an external unblock) ·
`superseded`. Confidence: high / medium / low.

---

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
