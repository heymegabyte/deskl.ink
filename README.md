<div align="center">

# deskl.ink

### A desktop for you. A computer for your AI.

Instantly available, browser-accessible Linux workstations — operable by a human, an AI agent,
many cooperating agents, or a human and AI together. Cloudflare-native. **Open computer**, not
_configure cloud infrastructure_.

</div>

---

> **Status:** Founding / early build. Milestone 1 (beautiful shell) in progress.
> Scope + progress live in [`docs/ROADMAP.md`](docs/ROADMAP.md). Architecture in
> [`docs/adr/0001-platform-architecture.md`](docs/adr/0001-platform-architecture.md).

## What it is

Visit deskl.ink → an extraordinary WebGL homepage → sign in → create a 4 GiB Ubuntu workstation →
open it → the whole browser becomes the Linux desktop with a tiny translucent control surface in the
upper-right. Work yourself, hand it to an AI, or work together. Everything persists when the machine
stops. Everything it did is recorded into **human-viewable and AI-readable** history. It
auto-stops after 10 idle minutes.

## Architecture

```
Browser ─▶ CF Worker (Hono, auth/API) ─▶ Durable Object (one per desktop) ─▶ Cloudflare Container (Ubuntu)
R2 = durable truth (backups · screenshots · recordings · exports · AI memory)   D1 = accounts/app data
```

## Monorepo layout

| Path               | What                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `apps/web`         | React 19 + Vite + Tailwind v4 — homepage overlay, desktop manager, fullscreen desktop route |
| `workers/api`      | Cloudflare Worker (Hono) — auth, billing, lifecycle, control-plane, MCP, API v1             |
| `packages/shared`  | Design tokens (black/cyan) + shared TypeScript types                                        |
| `packages/schemas` | Zod schemas (single source of truth → OpenAPI + typed clients) — _M2+_                      |
| `container/ubuntu` | Ubuntu + XFCE + Install Doctor profile + VNC + desklink-agent — _M4+_                       |
| `mcp/`             | DeskLink MCP server (capability-scoped) — _M8+_                                             |
| `docs/`            | ROADMAP (build ledger) + ADRs                                                               |

## Local development

Requires **Node 22+** (repo uses Node 26) and **pnpm 10**.

```bash
pnpm install            # install all workspaces
pnpm dev                # run the web app (Vite dev server)
pnpm -C workers/api dev # run the API worker locally (wrangler)
pnpm typecheck          # strict TypeScript across workspaces
pnpm lint && pnpm format
pnpm test               # unit/integration (vitest) — added per milestone
```

## Configuration & secrets

Copy `.env.example` → `.env` (and Worker secrets → `.dev.vars` / `wrangler secret`). **Never commit
secrets.** Stripe runs in **test mode**. Cloudflare account/binding IDs and OAuth app credentials are
documented as setup checklists in `docs/` as each milestone lands; nothing in the repo contains real
credentials.

## Design language

Black `#05060A` · near-black · **electric cyan `#00E5FF`** · violet accent `#7C3AED` · very restrained
white · deep translucent glass · subtle bloom · cinematic motion · premium WebGL. Fonts: Sora /
Space Grotesk / JetBrains Mono. Must remain fully usable without WebGL and honor `prefers-reduced-motion`.

## Repo history note

This repository previously held a backup of an unrelated Electron app ("emdash"). That backup is
preserved at tag **`archive/emdash-v0.4.15`** and on `origin/main` history. deskl.ink was founded
over it on 2026-10-03.

```bash
git checkout archive/emdash-v0.4.15   # recover the emdash backup if ever needed
```

## License

See [`LICENSE.md`](LICENSE.md).
