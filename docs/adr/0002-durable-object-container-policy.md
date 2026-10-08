# ADR-0002 — Universal `Computer` on the Durable-Object container scheduling policy

- **Status:** Accepted as DIRECTION; implemented as **deployed foundation, FLAG-GATED OFF**
  (`COMPUTER_DO`). **BLOCKED** on the `durable_object` multi-image **runtime launch** API: wiring is
  live + verified up to the point that `ctx.container.start({ image, instance })` returns `Ok` but
  launches **0 instances** (see § Blocker). The **live path remains the proven 12-class fleet**;
  flip `COMPUTER_DO=1` to re-test once the launch API is confirmed. Supersedes-in-intent the
  per-(distro × size) fan-out under ADR-0001 gate #1, but does NOT replace it until unblocked.
- **Date:** 2026-10-07 (status revised same day after live verification found the launch blocker)
- **Context:** The create path had grown to **12 Durable Object classes** — one per
  (distro × size) — because the `@cloudflare/containers` helper (`extends Container`) fixes both the
  **image** and the **`instance_type`** at the class/config level, with no per-instance override
  (verified against 0.3.7). Adding desktop/server form, more distros, or OS versions would multiply
  that matrix further (3 distros × 4 sizes × 2 forms × N versions …), which is untenable and makes
  "behavior derives from capabilities" impossible.

## Decision

Adopt Cloudflare's **`durable_object` container scheduling policy** (public beta) and collapse the
matrix into **one** container-backed Durable Object class, `Computer`, that selects its image +
instance size **at runtime**. Which image + size a given computer runs becomes **data** (persisted
in the DO's own storage at create), not a class identity.

### Verified Cloudflare API (confirmed this session against current first-party docs + a live dry-run)

- **Policy** — `scheduling_policy = "durable_object"` on a `[[containers]]` app. One Wrangler config
  may mix `default`-policy and `durable_object`-policy apps (it does here during the transition).
- **Images map** — `images = { "<key>" = { dockerfile = "<path>" }, … }`. Confirmed present at
  runtime: `ctx.container.images` is an object with keys `["debian-desktop","fedora-desktop",
  "ubuntu-desktop"]`, each resolving to a **string** image reference. (A bare string value in
  wrangler is rejected — must be an object with `dockerfile` or `image`; the dry-run caught this in
  seconds, before any build.)
- **Runtime start — UNRESOLVED (the blocker).** Current public docs (`containers/reference/
  container-class`, `durable-objects/api/container`) document `start()` options as only `env`,
  `entrypoint`, `enableInternet` — **no `image` or `instance`**. Calling
  `ctx.container.start({ image: ctx.container.images[key], instance: "standard-1", enableInternet,
  env })` returns without error but `wrangler containers list` then shows the app `ready` with **0
  live instances** — i.e. no container launches. So how a `durable_object` multi-image app selects
  **which image** + **what instance size** to launch at runtime is NOT confirmable from current
  docs. This is the one thing standing between the wiring and a live cutover.
- **Base class** — a plain `extends DurableObject` (NOT the `Container` helper); `ctx.container` is
  the raw surface. `fetch` **must** carry the `override` modifier (the base declares it).
- **VNC proxy** — `ctx.container.getTcpPort(port).fetch(request)` proxies HTTP **and** WebSocket.
  The request is forwarded **unmodified**: the port fetcher is bound to that TCP port (URL host is
  irrelevant to routing), and NOT reconstructing the request preserves the forbidden
  `Upgrade`/`Connection` headers — the exact header-drop that wedged VNC under the old helper proxy.
- **Lifecycle** — confirmed on the raw surface: `ctx.container.running`, `.start()`, `.monitor()`,
  `.destroy()` (SIGKILL). A graceful `.stop()` and `.setInactivityTimeout(ms)` are `Container`-HELPER
  conveniences (CF docs: the helper "handles ... sleep timeouts for you") and may be absent on the
  raw surface — `Computer.ts` feature-detects them (SIGTERM→destroy fallback for stop; idle-stop
  no-ops if absent). The activity-aware 10-min idle auto-stop + `snapshotContainer()`-based
  persistence are M6 slices built on a DO alarm, not assumed here.
- **Constraints** — `max_instances` is **not** supported with `durable_object` policy; the policy
  is **immutable per app** (a different policy later = a new app). SQLite storage via a
  `new_sqlite_classes` migration (`v4` here), same as every other DO in this worker.

### Shape

```
routes/desktops.ts ─▶ env.COMPUTER.get(idFromName(id))  ── one DO per computer id
                         │  configure({ imageKey, instance })   ← persisted at create
                         │  startComputer() / stopComputer() / destroyComputer()
                         └─ fetch() ─▶ ctx.container.getTcpPort(6080).fetch(req)  ← VNC (HTTP+WS)

compute/catalog.ts     imageKeyFor(distro, form) ─▶ "ubuntu-desktop" | …  (wrangler images key)
                       instanceFor(size)         ─▶ "standard-1".."standard-4"  (real RAM tier)
```

`DistroId` + `DesktopSizeId` stay the user-facing contract in `@deskl/shared`; the catalog is the
**one** place that maps them to CF runtime primitives (the spec's "central OS/Image Catalog; do not
scatter version strings"). The registry still stores `(distro, size)`, so it stays authoritative and
`start`/`ticket` re-affirm the DO's config from it (idempotent) — a cold DO always boots correctly.

## Why

- **Collapses 12 classes → 1**; form/version/more-distros/snapshots become catalog entries + data,
  not new DO classes. Unblocks the universal `Computer` abstraction the converged spec is built on.
- **Snapshot/restore + idle-stop** become reachable on this model (via `snapshotContainer` + a DO
  alarm) — the foundation for real persistence (R2 truth surviving container replacement) and the
  10-minute idle auto-stop, both currently missing. (Primitives to be verified the turn M6 starts.)
- **Simpler proxy** — raw `getTcpPort(port).fetch(req)` replaces the helper's switchPort/defaultPort
  dance that historically dropped WS upgrade headers.

## Blocker (why it ships flag-gated off)

Verified live on prod (Worker versions `5353bbc0` → `d21c0bf8`, 2026-10-07):

1. ✅ Policy deploys; `env.COMPUTER (Computer)` binding + `Computer (durable_object)` app register.
2. ✅ `Computer` DO instantiates; `configure()` / `startComputer()` RPC log `Ok`; create returns
   `status: "ready"`.
3. ✅ `ctx.container.images` present at runtime with the 3 expected keys (string refs).
4. ✅ VNC proxy wiring correct — after fixing the scheme (`getTcpPort` refuses HTTPS; rewrite to
   `http:`), the proxy reaches the container IP `10.0.0.1:6080`.
5. ❌ **No container instance ever launches.** `wrangler containers list` → `deskl-ink-api-computer`
   `ready`, **0 live instances**; the VNC proxy therefore gets "container is not listening in the
   TCP address 10.0.0.1:6080". `start({ image, instance })` is accepted but boots nothing.

**Exact next step to unblock** (the turn M-cutover starts): confirm, against Cloudflare's newest
`durable_object`-policy container docs (or support), the runtime call that LAUNCHES an instance from
a multi-image app and selects its instance size — candidates to test: (a) a different `start()`
option name/shape for `image`/`instance`; (b) `startAndWaitForPorts()` / a `waitForPort()` flow;
(c) instance size declared per-image in the wrangler `images` map rather than at runtime; (d) a
required `name`/`ports` field on the durable_object `[[containers]]` app. Repro is one `POST
/api/v1/desktops` with `COMPUTER_DO=1` + `wrangler containers list`.

## Migration + revert safety

- **Both backends ship; `COMPUTER_DO` selects.** Default (unset) → the proven 12-class fleet (live
  golden path). `COMPUTER_DO=1` → the `Computer` DO. One `Lifecycle` interface in
  `routes/desktops.ts`; the control-plane routes are backend-agnostic.
- **Additive + non-destructive.** The 12 `default`-policy classes + bindings + `v1/v2/v3` migrations
  are untouched and remain the live path; the `Computer` class + `COMPUTER` binding + `v4` migration
  + the `durable_object` app are additive foundation. Nothing is removed.
- **Re-test = flip a var** (`wrangler ... --var COMPUTER_DO:1` or a `[vars]` entry), no code change.
- **Verified by the existing golden path** (`e2e/golden-path.spec.ts`, flag off): create → VNC
  framebuffer paints → destroy (GET→404) stays green on the 12-class path.
- **Cleanup (only once `Computer` is proven):** remove the 12 classes via a `deleted_classes`
  migration + delete `DesktopContainer.ts`. Tracked in ROADMAP. NOT done now.

## Consequences

- `instance_type` is no longer declared per class; the catalog owns size→instance. Changing a size's
  RAM is a one-line catalog edit, not a new class + binding + migration.
- Per-user registry scoping (M2) and per-computer snapshot config now have an obvious home: the
  `Computer` DO's own storage, alongside its image/instance config.
- Beta risk: the `durable_object` policy is public beta. The raw `ctx.container` surface isn't in our
  pinned `@cloudflare/workers-types` yet, so it's narrowed locally in `Computer.ts` (documented).
  If CF changes the beta API, the blast radius is that one file + the catalog.
