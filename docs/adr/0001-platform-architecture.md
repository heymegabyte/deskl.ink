# ADR-0001 — Platform Architecture

- **Status:** Proposed (foundation accepted; infra choices pending research-gate verification)
- **Date:** 2026-10-03
- **Context:** Founding deskl.ink — browser-accessible Linux workstations for humans + AI agents.

## Decision summary

deskl.ink is **Cloudflare-native**. The authoritative request path is:

```
Browser → CF Worker (Hono) → Durable Object (one per desktop) → Cloudflare Container (Linux runtime)
```

- **D1** — relational account/app data (users, desktops, sessions, usage ledger, templates, shares).
- **R2** — durable truth for large objects (persistence backups, screenshots, recordings, exports, AI-memory artifacts, templates).
- **Durable Object storage** — small authoritative per-desktop coordination state.
- **One DO identity per desktop** owns lifecycle, status, concurrency, connection coordination,
  last-meaningful-activity, billing heartbeat, persistence state, active controller, observers,
  task/recording state, and recovery metadata.

Monorepo via **pnpm workspaces**; **TypeScript strict** everywhere; **Zod** as the single schema
source (→ OpenAPI + typed clients); frontend **React 19 + Vite + Tailwind v4** per house doctrine.

## Why Cloudflare-native

- Single platform for edge compute (Workers), stateful coordination (DO), container runtime
  (Containers), object storage (R2), relational (D1), and WS proxying — minimal moving parts, global.
- Deep CF lock-in is treated as leverage, not risk (house doctrine). No portability abstraction layer.

## Decisions marked PROPOSED — must verify current first-party docs before locking (research gates)

Each is wired into `docs/ROADMAP.md` research gates. Do **not** cargo-cult stale examples; confirm
against current Cloudflare / vendor docs (use context7 + first-party docs) the turn the slice starts.

| #   | Decision (proposed)                                                                              | Verify before locking                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Durable Object Container API** (modern) to drive one Container per DesktopDO                   | Current CF Containers + DO Container API docs; `standard-1` = 4 GiB; `linux/amd64` requirement; concurrency/lifecycle controls; pricing                     |
| 2   | **Better Auth** on Workers + D1 for GitHub/Google OAuth + email magic link                       | Current Better Auth CF-Workers + D1 adapter compatibility; if materially worse than an alternative on CF, revisit                                           |
| 3   | **TigerVNC + noVNC** for v1 remote desktop (standards-compatible), WS-proxied through Worker/DO  | noVNC current; KasmVNC / WebRTC only if benefits materially outweigh standard VNC-client compat                                                             |
| 4   | **restic → R2 (S3-compatible)** for incremental, chunk-deduped, encrypted, versioned persistence | restic S3/R2 compatibility current; else equivalent content-addressed engine. CF snapshots = cache only, never sole recovery                                |
| 5   | **XFCE** as the first desktop environment (lightweight, usable on 4 GiB, themeable)              | Evaluate vs other practical lightweight DEs for polish/RAM                                                                                                  |
| 6   | **Install Doctor** (`https://install.doctor`) as provisioning foundation                         | Inspect current repo/docs; build a deskl.ink cloud-workstation profile; `HEADLESS_INSTALL=true`, Standard-Desktop group; don't duplicate its software model |
| 7   | **Superset** standalone headless preinstalled (dogfooding)                                       | Current supported Linux/headless install mechanism; `superset start`; no subscription creds in base image                                                   |
| 8   | **Stripe** test-mode billing; **PricingService** derives rates from real CF pricing              | Current CF limits/pricing; Stripe webhook verify + idempotency                                                                                              |

## Consequences

- Vertical-slice delivery (one milestone-slice per loop) over breadth-first stubs.
- Every runtime boundary gets Zod; every desktop operation gets ownership + capability checks.
- Secrets never enter the user filesystem or git; scoped brokers only; `.env.example` documents keys.
- Lifecycle operations are idempotent; "Stopped safely" is reported only after durable-checkpoint
  confirmation.

## Security posture (threat model seed)

Assume the tenant workstation can become hostile (arbitrary user code + passwordless sudo _inside_
the isolated workstation, never infra creds). No shared VNC passwords, no public unauthenticated VNC,
short-lived scoped connection capabilities, strict ownership checks, signed/scoped URLs, encrypted
secret storage, Stripe webhook verification, security headers + CSP, auditable actions, CI secret
scanning. Full threat model is a cross-cutting ROADMAP item.

## Alternatives considered (and why not, for now)

- **Fly.io / raw VM / k8s for the Linux runtime** — rejected: abandons CF-native leverage, adds a
  second control plane; CF Containers covers v1. Revisit only if CF Containers can't meet latency/size.
- **Self-hosted auth (hand-rolled)** — rejected: Better Auth covers OAuth + magic link + linking +
  session rotation with less bespoke security-critical code.
- **MP4-only recording** — rejected by product judgment: DeskLink Memory (AI-readable timeline +
  OCR + screenshots + video) is the differentiator, not raw video.
