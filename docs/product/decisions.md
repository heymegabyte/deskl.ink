# deskl.ink — Decision Ledger

Canonical record of consequential product/architecture decisions (per the DeskLink spec §136).
Newest first. Each: **Decision · Alternatives · Rationale · Evidence · Date · Status · Confidence ·
Reconsider when**. ADRs hold the long form; this is the index + the calls that aren't full ADRs.

Status: `active` (in force) · `interim` (deliberate stopgap) · `blocked` (needs an external unblock) ·
`superseded`. Confidence: high / medium / low.

---

### D21 — Resilience: a top-level error boundary + honest auth (no dead no-op stubs)
- **Decision:** Wrap the app in a branded error boundary (blank-white-screen → "Something went wrong"
  + reload + a structured `ui_crash` log). Replace the overlay's dead `noopAuth` buttons with a
  WORKING primary "Start now — it's free" (enters the anonymous-session workspace) + GitHub/Google
  shown as explicit coming-soon (disabled + "Soon" pill).
- **Alternatives:** (a) no error boundary (status quo — a render error = blank screen); (b) keep the
  OAuth buttons as no-ops "until M2" (a zero-stubs violation — they look clickable but do nothing);
  (c) wire the OAuth buttons to "continue as guest" (misleading — implies real GitHub/Google auth);
  (d) hide account options entirely (loses the signal that accounts are coming).
- **Rationale:** Both are production-readiness gaps that don't need credentials. The app genuinely
  works without an account, so "Start now" is the honest primary; disabled+"Soon" is honest about M2
  without pretending. The boundary's structured log is Sentry-ready (D14 shape).
- **Evidence:** Verified live (`deskl.ink`): the gated `?__selftest=crash` trips the boundary → branded
  fallback (screenshot); auth panel honest + polished (screenshot) + axe-clean; `resilience` spec 2/2
  + full 14-test suite green (incl. golden-path).
- **Date:** 2026-10-08 · **Status:** active · **Confidence:** high
- **Reconsider when:** M2 (Better Auth) lands → wire the OAuth/email buttons for real + drop the
  coming-soon treatment; add Sentry capture in `componentDidCatch` once the DSN is set.

### D20 — Discovery layer = real robots/sitemap/llms static files + accurate JSON-LD
- **Decision:** Ship real `robots.txt` / `sitemap.xml` / `llms.txt` static files + a homepage canonical
  + accurate `WebSite`/`SoftwareApplication` JSON-LD. JSON-LD is an inline `application/ld+json` data
  block (non-executable → not subject to the strict `script-src 'self'`).
- **Alternatives:** (a) leave them to the SPA fallback (the bug — they returned `text/html` index.html,
  so crawlers got the app, not the files); (b) generate structured data at runtime in the Worker
  (needless — the homepage is static); (c) pad JSON-LD with FAQPage/AggregateRating (violates
  "accurate types only"; no real reviews/FAQ exist).
- **Rationale:** "Distribution > technology" — a public product needs to be found (search + AI-search
  engines). llms.txt is on-brand ("a computer for your AI"). Everything is kept ACCURATE: llms.txt +
  featureList describe only SHIPPED behavior (no billing/persistence/MCP claims), and no fabricated
  price/rating.
- **Evidence:** Verified live (`deskl.ink`): `/robots.txt` text/plain, `/sitemap.xml` application/xml,
  `/llms.txt` text/plain — all real content (not the HTML fallback); canonical present; JSON-LD valid
  (`WebSite` + `SoftwareApplication`) and CSP-clean (console-gated specs green); `seo` spec 2/2 +
  full 12-test suite green.
- **Date:** 2026-10-08 · **Status:** active · **Confidence:** high
- **Reconsider when:** real public sub-routes/content appear (blog, docs) → add them to the sitemap +
  give each accurate per-page JSON-LD; or real FAQs/reviews exist → add those types (never before).

### D19 — Offline service worker = conservative, control-plane-safe (network-first + never cache /api)
- **Decision:** A hand-rolled `public/sw.js`: network-first for navigations (fresh shell online,
  cached shell / branded `/offline` page when unreachable), cache-first ONLY for immutable
  fingerprinted `/assets`+`/fonts`+icons, and `/api/*` (incl. `/vnc`+`/term`) NEVER cached. skipWaiting
  + clients.claim + old-cache cleanup. Registered non-blocking from main.tsx.
- **Alternatives:** (a) Workbox/vite-plugin-pwa with a precache manifest — more build machinery + a
  generated SW that's harder to reason about than ~70 lines of explicit, auditable strategy; (b) a
  cache-first shell — risks serving a stale app ("stuck on old version"); (c) no SW (D18 state) —
  leaves the PWA non-functional offline.
- **Rationale:** Completes the installable PWA (the shell loads on flaky/no network). The strategy is
  deliberately conservative so it CAN'T break the product: a throwing handler degrades to normal
  network; network-first means online is always fresh; and never-touching `/api` keeps the control
  plane + live desktop streams entirely on the network. On a staging-less prod, that safety margin is
  the whole point.
- **Evidence:** Verified live (`deskl.ink`): SW activated + controlling at root scope; caches hold
  ONLY the shell + `/offline`, **zero `/api` entries**; offline-reload renders the shell from cache
  (`offline` spec); and the FULL 10-test suite — including golden-path (create→VNC→delete, all `/api`)
  — stays green with the SW active, proving it never intercepts the control plane.
- **Lesson:** Workers Assets 307-redirects `/x.html` → `/x`; precache the CANONICAL extensionless URL,
  because a cached *redirected* Response throws "redirections" when served for a navigation.
- **Date:** 2026-10-08 · **Status:** active · **Confidence:** high
- **Reconsider when:** richer offline is wanted (queue mutations, offline computer list) → a more
  involved strategy; or a SW bug appears → ship a self-unregistering kill-switch SW (network-first
  already limits blast radius).

### D18 — Installable PWA = manifest-only, SVG icons (no service worker, no raster generation)
- **Decision:** Ship a web app manifest (standalone display, theme/bg `#05060A`, any+maskable icons,
  a "New computer" shortcut → `/?new=1`) to make deskl.ink installable. No service worker. Icons are
  SVG with `sizes: "any"`; the maskable one is hand-authored (full-bleed bg + glyph in the safe zone).
- **Alternatives:** (a) add a service worker for installability — not required since Chrome 108/112
  (verified: `developer.chrome.com/blog/update-install-criteria`), and an empty-fetch SW hurts perf;
  (b) generate 192/512 PNG icons — needs rsvg/magick/sharp (none available) and SVG `any` already
  satisfies the 192+512 criterion while staying crisp at every size; (c) a full offline PWA now —
  SW caching risks stale-content bugs; it's a cleaner separable slice.
- **Rationale:** Installability is genuinely on-brand ("a desktop for you" → install it like an app)
  and cheap done this way. SVG icons are superior (resolution-independent). The CSP's `manifest-src
  'self'` + `worker-src 'self' blob:` were pre-provisioned in D13.
- **Evidence:** Verified live (`deskl.ink`): `/manifest.webmanifest` → 200 `application/manifest+json`
  with all required fields + any+maskable; maskable icon served; `/?new=1` enters the app + opens the
  picker + strips the param; 0 console errors; `pwa` spec 2/2 + full suite green.
- **Date:** 2026-10-08 · **Status:** active · **Confidence:** high
- **Reconsider when:** offline matters → add a Workbox/hand-rolled service worker caching the shell +
  fonts (CSP already allows it); or Android splash wants raster → add a build-step for 192/512 PNGs.

### D17 — Self-host webfonts (no Google origin) → tighter CSP
- **Decision:** Serve Sora / Space Grotesk / JetBrains Mono as same-origin woff2 from `/fonts/*`
  (`src/fonts.css` @font-face, latin subset, `font-display: swap`) instead of the Google Fonts
  `<link>`. Drop ALL google/gstatic allowances from the CSP (`style-src`/`font-src`/`connect-src`
  back to `'self'`).
- **Alternatives:** (a) keep Google Fonts + just widen `connect-src` (the D13 band-aid — leaves a
  third-party dependency + privacy leak + the connect quirk); (b) a font-subsetting build step
  (more moving parts than 10 static files for a fixed set of weights); (c) `fontsource` npm packages
  (an extra dependency vs. copying Google's own verbatim faces).
- **Rationale:** Removes a third-party dependency on the critical render path — privacy (no Google
  tracking of users), performance (no extra DNS/TLS to two origins; served with our immutable cache),
  offline-resilience, and a strictly tighter CSP. Copying Google's exact `unicode-range` keeps glyph
  coverage identical (latin range covers —, …, ·, ↑↓, curly quotes; the only non-latin glyph in the
  app, ⌘, is comment-only). Supersedes the D13 connect-src font band-aid.
- **Evidence:** Verified live (`deskl.ink`): CSP carries no google origin; fonts fetched from
  `/fonts/*` (same-origin, immutable), ZERO Google requests (`performance` resource entries);
  `document.fonts` loaded + `h1` → Space Grotesk; screenshot = identical typography; 0 console errors;
  golden-path 2/2 + a11y 3/3 + command-palette + rename green.
- **Date:** 2026-10-08 · **Status:** active · **Confidence:** high
- **Reconsider when:** a new weight/family is added (fetch + drop in `/fonts/` + a face in
  `fonts.css`) or non-latin UI copy appears (add the latin-ext / needed subset faces).

### D16 — Command palette = a decoupled, App-owned ⌘K overlay (not a manager feature)
- **Decision:** A `⌘K`/`Ctrl+K` command palette that fetches its OWN owner-scoped computer list and
  invokes App's existing `openDesktop`/`goHome`/`reopenOverlay` — so it touches none of the
  monitor-critical manager/VNC code. v1 = nav to any computer + New/Home/Sign-out. "New computer"
  opens the real picker via a tiny additive `openPickerSignal` nonce on the manager (no refactor).
- **Alternatives:** (a) naive `⌘N`/`⌘W`/`⌘1-9` shortcuts (collide with browser-reserved keys, often
  un-preventable — rejected); (b) lift all manager state (list, create, stopAll) to App so the palette
  can drive everything (big refactor + risk to the golden path — deferred; it's why per-computer Stop /
  Stop-all are out of v1); (c) a routing-based palette (overkill for a single-view SPA).
- **Rationale:** ⌘K is the de-facto palette binding and doesn't fight the browser. Decoupling (palette
  fetches its own list, calls existing handlers) delivers the core value — instant keyboard nav to any
  computer — with near-zero blast radius. The manager goes `inert` while it's open so focus can't
  escape behind the modal.
- **Evidence:** Verified live (`deskl.ink`): `command-palette` spec green (⌘K opens + focuses, axe-
  clean via the editable-combobox/listbox pattern, filter narrows, Esc closes, "New computer"→picker);
  golden-path 2/2 + a11y 3/3 + rename unregressed. The console-gated spec also **caught a latent CSP
  regression** (font `connect-src`) — see D13 amendment.
- **Date:** 2026-10-08 · **Status:** active · **Confidence:** high
- **Reconsider when:** the palette needs state-mutating actions (Stop/Stop-all/Rename) → introduce a
  shared computer store (Context/Zustand) so App + manager + palette read one source, then add them.

### D15 — Rename = owner-scoped metadata PATCH + inline tile edit (no container touch)
- **Decision:** Rename is a metadata-only `PATCH /api/v1/desktops/:id` ({ name }), owner-scoped in the
  registry (`UPDATE … WHERE id = ? AND owner = ?`), allowed in ANY lifecycle state, never touching the
  container. UI is an inline tile edit: a keyboard-reachable pencil swaps the name `<h3>` for an input;
  Enter/click-away commit via a single `onBlur`, Escape cancels. Optimistic with revert-on-failure.
- **Alternatives:** (a) a rename modal (heavier, worse for a one-field edit); (b) rename only when
  stopped (needless — name is metadata, not container state); (c) a generic PUT replacing the whole
  resource (over-broad; most fields are server-derived/immutable).
- **Rationale:** Computers were stuck with auto-generated names with no fix — a real CRUD gap, and a
  spec-listed M4 tile action. Owner-scoping reuses the exact non-leak primitive as `getOwned` (a
  foreign id touches 0 rows → 404). Inline edit keeps the chrome-light tile uncluttered.
- **Evidence:** Verified live (`deskl.ink`): API probe create→PATCH→GET round-trips the new name;
  empty→400, foreign→404; UI `rename.spec` green (shows immediately AND persists across reload);
  golden-path 2/2 + a11y 3/3 unregressed.
- **Lesson (reconfirms D12):** a NEW DO **method** (not just a schema change) also waits on the hot
  singleton to evict — `rename` RPC 500'd for >2 min while probing kept the registry DO warm; it
  worked on the first call after a ~100s idle eviction cold-started the new code. Post-deploy checks of
  anything touching a long-lived DO must budget for the eviction window (or force idle first).
- **Date:** 2026-10-08 · **Status:** active · **Confidence:** high
- **Reconsider when:** more mutable fields arrive (size/persistence/tags) → generalize to a small
  typed patch set rather than a name-only endpoint.

### D14 — Observability: request correlation id + structured JSON logging (Sentry-ready foundation)
- **Decision:** A `requestLogger()` Hono middleware mints/propagates an `x-request-id` (honor a sane
  bounded inbound token, else a fresh UUID), threads it through the context, echoes it on the
  response, and emits ONE structured JSON line per request (`ts/level/msg/requestId/ray/method/path/
  status/durationMs/owner/desktop/environment`). `principalOf` stashes the resolved owner id so logs
  carry it. Mounted first so it times the full request.
- **Alternatives:** (a) pull in `@sentry/cloudflare` now (the estate baseline) — needs a `SENTRY_DSN`
  (creds-blocked), and correlation-id logging is the layer Sentry would *enrich* anyway, so build it
  first; (b) rely on `cf-ray` alone (no app-level owner/desktop correlation, no inbound trace
  propagation); (c) a logging lib (unneeded weight for one JSON line).
- **Rationale:** The control plane had only an unstructured `console.error` in `onError` — the
  `drift-detection` doctrine flags "logs without correlation IDs" as drift to fix immediately. A paid
  per-container control plane needs request→owner→desktop traceability. `cf-ray` in each line ties
  app logs to Cloudflare's own.
- **Safety:** the noVNC `/vnc/*` + ttyd `/term/*` WS tunnels are skipped from response mutation +
  per-request logging (a header on a `101` upgrade breaks the socket; a long-lived tunnel shouldn't
  log per frame). The id is still minted for them. All logging is `try/catch`ed so it can never break
  a response.
- **Evidence:** Verified live (`deskl.ink`): `x-request-id` minted / honored-inbound / replaced-when-
  unsafe / unique-per-request; real structured lines observed via `wrangler tail` with `owner` +
  `cf-ray` populated; golden-path E2E green (the middleware wraps every request).
- **Date:** 2026-10-08 · **Status:** active · **Confidence:** high
- **Reconsider when:** `SENTRY_DSN` lands → add `@sentry/cloudflare` and feed it this correlation
  context; or a log pipeline (Logpush → R2/Axiom) needs a fixed schema → promote `RequestLog` to a
  shared Zod contract.

### D13 — Browser security headers: enforcing CSP via `_headers`, JSON-scoped headers in the Worker
- **Decision:** Ship an **enforcing** Content-Security-Policy (not report-only) on the SPA document +
  static assets through a Workers-Assets `_headers` file (`apps/web/public/_headers`), plus HSTS,
  `X-Frame-Options: DENY` + `frame-ancestors 'none'`, nosniff, `Referrer-Policy`, a tight
  `Permissions-Policy`, and COOP. `script-src 'self'` with **no nonce** (the built `index.html` has a
  single external same-origin module). A separate Hono middleware stamps nosniff + `Referrer-Policy`
  + HSTS on **JSON responses only** (keyed off `Content-Type`).
- **Alternatives:** (a) report-only CSP first (slower to protect; the policy was already provably
  safe, so enforce now); (b) nonce + `strict-dynamic` (needs per-request HTML generation — the doc is
  a static asset, and there are no inline scripts to bless, so pure overhead); (c) one blanket Hono
  `app.use('*')` CSP (would stamp a restrictive policy onto the proxied noVNC `/vnc/*` + ttyd
  `/term/*` responses our own iframes embed, **breaking the core product**).
- **Rationale:** Prod served the SPA with **zero** security headers — arbitrary third-party script
  injection was possible (axe-core loaded straight from a CDN during the a11y sweep). Closes Hard
  Gate 8. The two-layer split is dictated by Cloudflare: `_headers` never applies to Worker responses,
  so the document policy and the JSON-scoped Worker headers can't collide, and the remote-desktop
  surfaces stay pristine. `clipboard` left at browser default so VNC/terminal copy-paste survives;
  `payment=(self)` pre-clears the imminent Stripe Element.
- **Evidence:** Verified live (`deskl.ink`): document carries the full policy; `/api/v1/version`
  carries the safe subset with **no CSP**; app renders clean under enforcement (0 breaking console
  errors; fonts + styles + module all load); CDN script-injection now **refused**
  (`script-src-elem` violation, `onerror`, `axe` undefined). axe WCAG 2.0/2.1/2.2 A+AA stayed 0
  violations across homepage/manager/picker.
- **Amended 2026-10-08:** `connect-src 'self'` was too strict — a fresh (uncached) load issues a
  connection to `fonts.googleapis.com` the browser classifies under connect-src (the console-gated
  command-palette E2E caught it; the manual check missed it because the font CSS was already cached).
  Fonts still rendered (via the stylesheet, allowed by style-src), so it was console noise, not a
  visual break. Added the two font origins to `connect-src` as a stopgap — **superseded same day by
  D17** (self-hosted fonts; all google/gstatic allowances dropped). Lesson: verify CSP in a FRESH,
  cache-less context.
- **Date:** 2026-10-08 · **Status:** active · **Confidence:** high
- **Reconsider when:** Stripe/PostHog/other 3rd-party origins land → widen the directives (the exact
  additions are documented inline in `_headers`); or the SPA gains inline scripts → move to
  nonce + `strict-dynamic` served through the Worker.

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
