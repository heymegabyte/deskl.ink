# CLAUDE.md — deskl.ink

Guidance for Claude Code working in this repo. Project-level; defers to the user's global doctrine.

## Product

**deskl.ink — "A desktop for you. A computer for your AI."** Instantly available, browser-accessible
Linux workstations operable by a human, an AI agent, many cooperating agents, or human + AI together.
The product must feel like **"open computer,"** never _"configure cloud infrastructure."_ Standalone
product — **not** a subsystem of ProjectSites.dev / megabyte.space or anything else. Other apps may
consume it later via its API/MCP, but deskl.ink owns its product, infra, UI, billing, auth, desktop
runtime, persistence, recording, API, and agent-control plane.

## Where scope + decisions live (read these first)

- `docs/ROADMAP.md` — the **build ledger**. Single source of truth for scope + progress. Drain it
  **one verified vertical slice per loop** (`split-work-into-ledger`); update it the same turn work lands.
- `docs/adr/*` — architecture decision records. Infra choices are **proposed pending research gates**;
  verify current first-party docs (context7 + official) the turn a gated slice starts. Don't cargo-cult.

## Architecture

```
Browser → CF Worker (Hono) → Durable Object (one per desktop) → Cloudflare Container (Ubuntu runtime)
R2 = durable truth (backups/screenshots/recordings/exports/AI-memory)   D1 = relational accounts/app data
DO storage = small authoritative per-desktop coordination state
```

Monorepo (pnpm): `apps/web` (React 19 + Vite + Tailwind v4), `workers/api` (Hono), `packages/shared`
(design tokens + types), `packages/schemas` (Zod → OpenAPI + clients), `container/`, `mcp/`.

## Non-negotiables

- **Cloudflare-native** — reach for CF primitives directly (Workers/DO/Containers/R2/D1/WS). Deep
  lock-in is leverage; no portability layer.
- **Zod at every runtime boundary**; TypeScript strict; typed contracts for every AI/API output.
- **Secrets never in git or in the user's workstation filesystem.** `.env.example` documents keys;
  Stripe is **test mode**; scoped brokers only for platform capabilities. No infra master secrets inside
  a tenant desktop (assume the workstation can become hostile even with passwordless sudo _inside_ it).
- **Lifecycle idempotent.** Never report "Stopped safely" before the durable checkpoint is confirmed.
- **Never destroy user work.** Persistence (R2 = truth) must survive an actual container _replacement_,
  not just a graceful Stop.
- **Usable without WebGL**; honor `prefers-reduced-motion`; code-split so the fullscreen desktop route
  never loads homepage WebGL deps.

## Visual language

Black `#05060A` · near-black · electric cyan `#00E5FF` · violet `#7C3AED` · very restrained white ·
deep translucent glass · subtle bloom · precise type · cinematic motion · premium WebGL. The
workstation IS the product — UI chrome disappears whenever possible. Avoid generic SaaS dashboards,
excessive cards, giant permanent nav, clutter. Tokens: `packages/shared/src/design-tokens.ts`.

## Workflow

- Dev: `pnpm install`, `pnpm dev` (web), `pnpm -C workers/api dev`. Checks: `pnpm typecheck`,
  `pnpm lint`, `pnpm test`.
- TDD-first for important infra/state machinery (Durable Objects, persistence, billing, lifecycle):
  failing test → implement → verify. Golden-path E2E (the 26-step dogfood flow) is the definition of done.
- Verify slices by actually running/deploying and observing the real golden path — not just a green build.
- When a credential/external action can't be automated, isolate the dependency cleanly, document the
  exact remaining step, and continue — never replace a real implementation with a fake one.

## Product judgment rule

When the literal requirement has a mediocre obvious implementation and a materially better one
preserves the user's intent, build the better one (AI-readable DeskLink Memory over raw MP4s; a secure
human/AI control plane over bare VNC; a genuinely-restored workstation over a naive `/home` copy).
Never compromise the core simplicity.

## Repo history

Previously held an emdash (Electron) backup — preserved at tag `archive/emdash-v0.4.15` + `origin/main`.
deskl.ink founded over it 2026-10-03.
