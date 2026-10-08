# deskl.ink — Converged Product Spec + Honest Status

> **A desktop for you. A computer for your AI.**
> One instantly-available, browser-accessible Linux computer, operable by a human, an AI agent, many
> cooperating agents, or human + AI together. Standalone, Cloudflare-native product.

This is the **converged vision + the brutally honest current state**. `docs/ROADMAP.md` is the
milestone ledger; this file is the single place that (a) states the universal `Computer` model and
(b) tracks, per capability, whether it is **Implemented / Foundation / Deferred / Blocked** — with
the exact next step. It is updated the same turn work lands. No capability is marked done unless it
is verified against the real golden path, not just a green build.

Status legend:

- **Implemented** — built, deployed, verified end-to-end on the live product.
- **Foundation** — the real primitive/plumbing exists and is wired, but the full capability isn't
  user-complete yet.
- **Deferred** — not started; no external blocker; sequenced behind higher-priority slices.
- **Blocked** — cannot be completed now without an external credential/decision (named explicitly).

_Last updated: 2026-10-07 — the universal `Computer` DO slice (ADR-0002)._

---

## 1. The universal `Computer` model (the refactor spine)

A `Computer` is **one Durable Object per computer id**, backed by a Cloudflare Container whose
**image + instance size are chosen at runtime** (ADR-0002, `durable_object` scheduling policy).
Everything else is **capabilities + data**, not new classes:

- **origin** — where the compute runs. Today: `cloudflare-container`. The control-plane speaks to a
  provider-shaped surface (`configure / start / stop / destroy / fetch`), so a future non-CF origin
  is an implementation of that surface, not a rewrite of the routes. (We stay CF-native by doctrine;
  the seam exists for honesty about the data model, not to ship a portability layer.)
- **form** — `desktop` (full GUI over VNC) | `server` (headless; browser terminal only). Catalog
  field reserved; only `desktop` images are built today.
- **distro + version** — `ubuntu 24.04` (default) | `fedora 41` | `debian 12`. Resolved by the
  central catalog to a wrangler image key (`<distro>-<form>`).
- **size** — `everyday 4` | `developer 6` | `power 8` | `heavy 12` GiB. Resolved by the catalog to a
  real CF instance (`standard-1..4`). **Real RAM, not a label.**
- **capabilities** — VNC desktop, (future) terminal, (future) control API/MCP, (future) recording.
  Behavior derives from these, so a `server` computer simply lacks the VNC-desktop capability.

**Central catalog:** `workers/api/src/compute/catalog.ts` is the ONE place mapping product concepts
→ CF primitives. No version strings or instance types scattered across routes.

---

## 2. Honest status matrix (P0 first)

| # | Capability | Status | Where / exact next step |
|---|------------|--------|--------------------------|
| **P0** | | | |
| 1 | **Auth boundary** | **Authorization ✅ · identity deferred** | **Server-side OWNERSHIP now enforced (2026-10-07).** Every request resolves a signed, HttpOnly session **principal** (`deskl_sid`, HMAC — unforgeable); registry rows carry an `owner`; list is owner-scoped and get/start/stop/ticket/**destroy** authorize actor→resource (cross-principal access → **404**, verified live: principal B gets 404 on A's computer for read AND destroy). This **closes the pre-auth hole** (anyone controlling any computer). STILL DEFERRED: real user **identity** — Google/GitHub OAuth + email magic link (Better Auth) to UPGRADE the anonymous principal into an account — blocked on external OAuth apps + email creds. Optional `ADMIN_TOKEN` + `x-deskl-admin` = ops bypass (off by default). ROADMAP M2 + the 5-min SSO threshold. |
| 2 | Universal `Computer` DO (runtime image/size) | **Foundation** (flag-gated off) | `Computer.ts` + `catalog.ts` + `durable_object` wrangler app + `COMPUTER` binding — all deployed. Verified live up to container launch; **blocked**: `start({image,instance})` returns Ok but launches 0 instances (ADR-0002 § Blocker). Live path stays the 12-class fleet; flip `COMPUTER_DO=1` to re-test once the launch API is confirmed. |
| 3 | New Computer (one action → booting desktop) | **Implemented** | `POST /api/v1/desktops` auto-configures + starts; OS picker modal. |
| 4 | Desktop **vs Server** form | **Foundation** | `form` in catalog + `imageKeyFor(distro, form)`. Next: build `container/<distro>-server` (no X/VNC, just sshd + shell), add `*-server` wrangler image keys, expose form in the picker + create request. |
| 5 | Cloud desktop over the browser (VNC) | **Implemented** | TigerVNC + noVNC + websockify :6080, proxied HTTP+WS through the `Computer` DO's `getTcpPort`. |
| 6 | Version selector (per distro) | **Deferred** | Each distro pins one version (`DISTROS[].version`). Next: catalog multi-version images + a version row in the picker. |
| 7 | VM size selector (real RAM) | **Implemented** | 4 tiers → `standard-1..4`; now a per-instance runtime choice (no longer 9 extra classes). |
| 8 | Remote desktop chrome (exit/stop, auto-hide) | **Implemented** | `DesktopFullscreen` control surface; self-healing ticket. |
| 9 | Browser **terminal** | **Implemented** (Ubuntu) | ttyd on container port 7681, proxied under `/api/v1/desktops/:id/term/*` with the SAME signed ticket as VNC. The DesktopContainer DO's `fetch` routes `/term`→ttyd **in-DO** so the terminal WebSocket tunnels through the stub fetch (a WS can't cross DO-RPC — `DataCloneError`). Toggle + docked panel in the fullscreen view. **Verified live:** HTML + `/token` + WS `101 (tty)`; golden-path E2E covers the toggle→panel. Fedora/Debian images get ttyd next (UI gated to Ubuntu until then). |
| 10 | **OpenCode** preinstalled | **Deferred** | Add to the image build (Dockerfile) + surface a launcher. Low-risk once a terminal/agent surface exists. |
| 11 | **DeskLink AI** gateway (DeepSeek) | **Blocked** | Must NOT ship one master DeepSeek key. Needs the gateway design (scoped per-computer tokens via CF AI Gateway) + a DeepSeek credential. Next: ADR + gateway worker route minting short-lived scoped tokens. |
| 12 | Persistence (R2 = truth, survive replacement) | **Foundation** | `ctx.container.snapshotContainer()` is now available on the `Computer` DO. R2 buckets are staged (commented) in wrangler. Next: ADR-0001 gate #4 (restic→R2 vs snapshot), graceful pre-stop checkpoint, restore onto a replacement host. ROADMAP M6. |
| 13 | **Stop** (not pause) | **Implemented** | `POST /:id/stop` → `stopComputer()`; idempotent. |
| 14 | 10-minute **idle auto-stop** | **Foundation** | `Computer.startComputer()` *attempts* `setInactivityTimeout(10m)`, but that's a `Container`-helper convenience and may be absent on the raw `durable_object` surface (feature-detected, never throws). A robust activity-aware idle-stop (human/agent/MCP vs polling; flush + persist + verify durable checkpoint BEFORE stop; never report "Stopped safely" early) is the M6 slice, best built on a DO alarm. ROADMAP M6. |
| 15 | Wallet / Stripe / FinOps / **live cost meter** | **Foundation** — live cost ✅, wallet blocked | **Global financial bar LIVE** (spec §39): running count + estimated hourly burn + session estimate, in the app header. Computed from Cloudflare's **real** published rate card (`CF_CONTAINER_RATES` + `estimateDesktopCost` in `@deskl/shared`, memory+disk baseline; active-CPU shown as an "up to" band) × each running computer's uptime — honestly an ESTIMATE (§43), no fabricated wallet balance. Verified live + golden-path E2E. **Deferred/blocked:** wallet balance, top-ups, metered ledger + reconciliation, budgets — need Stripe test keys + a usage ledger (M3). |
| **P1–P3** | | | |
| 16 | **Tabs** — all computers as tabs (§33) | **Implemented** (core) | Persistent top strip: **Home** (the manager grid) + one tab per OPEN computer + **New**. Opening a computer adds+selects its tab; the active tab's desktop fills everything UNDER the strip (§38, not a full overlay). Closing a tab is **view-only** (never Stop/Destroy, §35); deleting a computer auto-closes its tab. Each tab shows distro mark + name + a live state dot (§34 separates view from lifecycle). Golden-path E2E asserts the strip + tab; renders on-brand. **Next (§35/§36):** cross-reload tab restore, drag-reorder, overflow/search, the server-tab workspace, per-tab cost/AI/recording badges. |
| 17 | Control **API + MCP** (Computer Use + native) | **Foundation** | REST control-plane exists (`/api/v1/desktops/*`, Zod-validated). No pointer/type/exec/screenshot API, no MCP server, no controller arbitration yet. ROADMAP M8. |
| 18 | DeskLink **Memory** (recording/OCR/timeline) | **Deferred** | Product-judgment: AI-readable timeline over raw MP4. ROADMAP M7. |
| 19 | Transfer shelf / clipboard / upload-download | **Deferred** | Needs the control API + a UI surface. |
| 20 | Memorable install URLs + `desklinkd` agent | **Deferred** | Human-memorable per-computer handle (NOT a password — memorability ≠ authorization; enforce authz server-side regardless). |
| 21 | Fleets / templates / disposable | **Deferred** | ROADMAP M10; `disposable` flag already in the create contract. |
| 22 | Enterprise SSO / RBAC / DLP / audit | **Deferred** | After the core auth boundary (#1). |

---

## 3. Security invariants (never violated, independent of status)

These hold now and must keep holding as capabilities land:

- **Authorization is server-side, at every boundary.** Hiding a React control is NOT authorization.
  A memorable slug/handle is NOT a credential. **Enforced now:** a signed session principal owns its
  computers and every control-plane route authorizes actor→resource (cross-principal → 404). The
  remaining gap is *identity* (anonymous principal, not yet a real account) — so this is a
  single-user-per-browser preview until OAuth/magic-link upgrades the principal, but it is NO LONGER
  an open multi-tenant hole.
- **Interim cost-abuse guard (shipped 2026-10-07).** Until auth lands, `POST /api/v1/desktops` is
  rate-limited in the registry DO — per client IP (6/min) AND globally (30/min) — returning `429` +
  `Retry-After` BEFORE any container spins up, so an unauthenticated caller can't run up unbounded
  billable containers. Counts every POST attempt (incl. malformed). A backstop, not a substitute
  for auth.
- **VNC is never public.** HMAC ticket (signature + expiry + desktopId) + path-scoped HttpOnly
  cookie; no shared VNC password, no open port. (See [[vnc-canvas-render-verification]] for how we
  *prove* a desktop actually rendered, vs a blank canvas.)
- **Secrets never in git or in the tenant filesystem.** `.env.example` documents keys; Stripe is
  test-mode; scoped brokers only. Assume the workstation can become hostile even with passwordless
  sudo *inside* it — no infra master secret ever lives in a tenant desktop.
- **Never distribute one master AI key.** DeskLink AI mints scoped, short-lived per-computer tokens.
- **Only approved immutable images boot.** Clients never supply arbitrary Docker images; the catalog
  is the allowlist.
- **Lifecycle idempotent; never report "Stopped safely" before the durable checkpoint is confirmed.**
- **Never destroy user work.** Persistence (R2 = truth) must survive an actual container
  *replacement*, not just a graceful Stop.

---

## 4. Explicitly NOT possible on CF Containers (honest no, not a fake card)

- **Qubes OS** — bare-metal Xen Type-1 hypervisor; needs VT-x/VT-d/IOMMU + no nested virt. Infeasible
  as a container. **macOS** — Darwin kernel + Apple-HW EULA. **Windows** — NT kernel; needs a full VM
  with nested virt CF doesn't expose. Only Linux-kernel distros can be CF-container desktops. A
  Linux + Wine/Bottles surface *for Windows apps* is the honest in-container alternative (label it
  accurately — it's Linux+Wine, not Windows). Full reasoning: [[qubes-infeasible-on-cf-containers]].

---

## 5. Immediate P0 sequence (what to drain next, in order)

1. **Auth boundary (M2)** — ✅ authorization/ownership DONE (signed principal + owner-scoped
   routes). **Remaining: identity** — Better Auth on Workers+D1 to UPGRADE the anonymous principal
   via Google/GitHub OAuth + email magic link, + the 5-minute SSO threshold. *Blocked on external
   OAuth apps + email creds; the principal seam is already in place so this is an upgrade, not a
   rebuild.*
2. **Persistence foundation (M6)** — use `snapshotContainer()` + R2 so a computer survives
   container replacement. This is the "never destroy user work" promise; it gates trust.
3. **Browser terminal (P0 #9)** — `getTcpPort` makes the proxy trivial; unblocks OpenCode + a
   server form that's actually useful headless.
4. **Idle-stop semantics (M6)** — upgrade the raw inactivity timeout into activity-aware,
   checkpoint-before-stop behavior.

Cross-reference: `docs/ROADMAP.md` (milestone detail), `docs/adr/0001-platform-architecture.md`
(research gates), `docs/adr/0002-durable-object-container-policy.md` (the `Computer` keystone).
