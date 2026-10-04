# @deskl/api — desktop control-plane

The Cloudflare Worker (Hono) that orchestrates deskl.ink desktops: create, list,
start, stop, destroy, and proxy a secure VNC connection to each one. Every
request/response boundary is validated against the shared Zod contract in
[`@deskl/shared`](../../packages/shared/src/desktop-api.ts) — the single source
of truth shared by this server, the web app, and the E2E test.

## Architecture

| Piece                    | What it is                                                                                                       | File                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **Hono app**             | HTTP entry; health, version, mounts the control-plane                                                            | `src/index.ts`                       |
| **DesktopContainer**     | Container-enabled Durable Object — one per live desktop; runs the Ubuntu image, serves VNC                       | `src/containers/DesktopContainer.ts` |
| **DesktopRegistry**      | Plain SQLite Durable Object — the authoritative desktop list (id, name, os, size, status, createdAt, persistent) | `src/containers/DesktopRegistry.ts`  |
| **Control-plane routes** | `/api/v1/desktops` sub-app: CRUD + lifecycle + VNC proxy                                                         | `src/routes/desktops.ts`             |
| **VNC tickets**          | HMAC-signed, 15-min, desktop-scoped connection capability                                                        | `src/routes/vnc-ticket.ts`           |

Two Durable Objects, one job each: **DesktopContainer** owns the live compute
(the Linux workstation), **DesktopRegistry** owns the metadata + lifecycle
state. The registry is a single global DO today; per-user scoping is M2 (see the
`getRegistry` TODO).

## Routes

All paths come from `desktopApi` in the shared contract so client, server, and
E2E can't drift.

| Method   | Path                         | Purpose                                                                                                                                                 |
| -------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/api/v1/desktops`           | Create a desktop (validates `CreateDesktopRequestSchema`), insert a registry row (`stopped`), mint a VNC ticket. Returns `CreateDesktopResponseSchema`. |
| `GET`    | `/api/v1/desktops`           | List every desktop. Returns `DesktopListResponseSchema`.                                                                                                |
| `GET`    | `/api/v1/desktops/:id`       | One desktop, or 404.                                                                                                                                    |
| `POST`   | `/api/v1/desktops/:id/start` | `getContainer(env.DESKTOP, id).start()`; status → `starting` → `ready`.                                                                                 |
| `POST`   | `/api/v1/desktops/:id/stop`  | `.stop()` (SIGTERM); status → `stopped`.                                                                                                                |
| `DELETE` | `/api/v1/desktops/:id`       | `.destroy()` (SIGKILL) + forget the registry row.                                                                                                       |
| `ALL`    | `/api/v1/desktops/:id/vnc/*` | Ticketed VNC proxy (HTTP + WebSocket).                                                                                                                  |

Lifecycle is **idempotent**: double-start, double-stop, and double-create are
all safe (`@cloudflare/containers` `start`/`stop`/`destroy` no-op when already
in the target state, and the registry uses upsert / no-op deletes).

## How VNC proxying works

The desktop image runs **websockify** on `VNC_CONTAINER_PORT` (6080) — it serves
the noVNC HTML client **and** a WebSocket proxy to the local VNC server. The
browser never talks to the container directly; it goes through the Worker:

```
browser ──wss──▶ /api/v1/desktops/:id/vnc/websockify?ticket=…
                        │  verify ticket (HMAC + exp + desktopId)  ← 401 on any defect
                        ▼
        getContainer(env.DESKTOP, id)
            .fetch(switchPort(req, 6080))   ← .fetch (NOT containerFetch) forwards the WS upgrade
                        ▼
              websockify ──▶ local VNC server (inside the container)
```

Key points:

- **`.fetch(switchPort(req, port))`, never `containerFetch`** — only `.fetch`
  forwards WebSocket upgrades. `switchPort` stamps the `cf-container-target-port`
  header so the request lands on websockify.
- **Never a public port.** The container's VNC port is never exposed; the only
  path in is this ticket-gated Worker route.
- **Tickets, not passwords.** A ticket is `base64url(claims).base64url(HMAC)`
  signed with `VNC_TICKET_SECRET` over `{ desktopId, exp }` (15-min TTL,
  `VncTicketClaimsSchema`). The route verifies signature (constant-time) +
  expiry + that the ticket's `desktopId` matches the `:id` in the path. Any
  mismatch → 401, before a single byte reaches the container.
- The client builds its URL with `desktopApi.vncClient(id, ticket)` (noVNC
  `vnc.html` + the `websockify` ws path, both carrying the ticket).

## Configuration (`wrangler.toml`)

- `containers[]` — `class_name = "DesktopContainer"`, `image = "../../container/ubuntu/Dockerfile"`, `instance_type = "standard-1"`, `max_instances = 25`.
- `durable_objects.bindings` — `DESKTOP` → `DesktopContainer`, `REGISTRY` → `DesktopRegistry`.
- `migrations` — `new_sqlite_classes = ["DesktopContainer", "DesktopRegistry"]` (container DOs **and** the registry both require SQLite storage).

## External prerequisites to actually spin a container

1. **Docker daemon running** locally — `wrangler deploy` builds the container
   image from the Dockerfile. (`open -a "Docker Desktop"`, wait for `docker info`.)
2. **Workers Paid plan** — Cloudflare Containers are paid-tier only.
3. **`container/ubuntu/Dockerfile`** present (built in the container workstream —
   not part of this control-plane).
4. **`VNC_TICKET_SECRET`** — `wrangler secret put VNC_TICKET_SECRET` before
   production. A deterministic dev fallback is used when unset so local dev
   works; the fallback is TODO-flagged for removal.

## Local dev

```bash
pnpm install          # resolves @cloudflare/containers + @deskl/shared workspace link
pnpm --filter @deskl/api dev
```

`wrangler dev` builds and runs the container locally (Docker required).
