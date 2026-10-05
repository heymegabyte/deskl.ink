/**
 * Desktop control-plane — the `/api/v1/desktops` Hono sub-app.
 *
 * Implements every route in `desktopApi` from the shared contract:
 *   - POST   /api/v1/desktops            create (+ mint VNC ticket)
 *   - GET    /api/v1/desktops            list
 *   - GET    /api/v1/desktops/:id        get one
 *   - POST   /api/v1/desktops/:id/start  start container  → status ready
 *   - POST   /api/v1/desktops/:id/stop   stop container   → status stopped
 *   - DELETE /api/v1/desktops/:id        destroy + forget
 *   - ALL    /api/v1/desktops/:id/vnc/*  ticketed VNC proxy (HTTP + WebSocket)
 *
 * Every request body is Zod-validated (`CreateDesktopRequestSchema`) and every
 * response is Zod-validated against its contract schema before it leaves the
 * Worker. Container lifecycle is idempotent (double-start / double-stop /
 * double-create are safe — see `@cloudflare/containers` semantics + the
 * registry's upsert/no-op methods). The VNC route is NEVER public: it verifies
 * an HMAC ticket (signature + expiry + desktopId) before proxying a packet.
 *
 * Mounted at `/api/v1/desktops` in `../index.ts`.
 */

import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { getContainer } from '@cloudflare/containers';
import {
  CreateDesktopRequestSchema,
  CreateDesktopResponseSchema,
  DESKTOP_SIZES,
  DISTROS,
  DesktopListResponseSchema,
  DesktopResponseSchema,
  VncTicketResponseSchema,
  type DesktopResource,
  type DistroId,
} from '@deskl/shared';
import type { Env } from '../env.js';
import type { DesktopRegistry } from '../containers/DesktopRegistry.js';
import { mintVncTicket, verifyVncTicket } from './vnc-ticket.js';

/**
 * Resolve the (currently global) desktop registry DO stub.
 *
 * TODO(M2): scope per user — resolve `getByName(REGISTRY, userId)` from the
 * authenticated session so each user gets an isolated registry. For now a
 * single well-known id holds the whole fleet.
 */
function getRegistry(env: Env): DurableObjectStub<DesktopRegistry> {
  // The `.get()` stub-proxy type over DesktopRegistry's RPC methods expands
  // recursively under exactOptionalPropertyTypes (TS2589). The function's return
  // annotation IS the authoritative contract, so cast the expression to it to
  // break the deep inference without weakening the stub's public type.
  const id = env.REGISTRY.idFromName('global');
  return env.REGISTRY.get(id) as unknown as DurableObjectStub<DesktopRegistry>;
}

/** The container-lifecycle surface the control-plane drives on a DesktopContainer. */
interface DesktopContainerStub {
  start(): Promise<void>;
  stop(): Promise<void>;
  destroy(): Promise<void>;
  fetch(req: Request): Response | Promise<Response>;
}

/**
 * Resolve a per-distro DesktopContainer stub narrowed to the lifecycle methods
 * we use, routed by `distro`:
 *   - `ubuntu` → `env.DESKTOP`        (DesktopContainer — the golden path)
 *   - `fedora` → `env.DESKTOP_FEDORA` (FedoraDesktop)
 *   - `debian` → `env.DESKTOP_DEBIAN` (DebianDesktop)
 * Each distro's container lives in its OWN Durable Object namespace, so a given
 * desktop id maps to the instance in the namespace for its distro.
 *
 * `getContainer(...)`'s full stub-proxy type expands recursively under
 * `exactOptionalPropertyTypes` (TS2589 at every call site). Narrowing to the
 * `DesktopContainerStub` surface breaks that deep inference once, here, without
 * changing runtime behavior (`getContainer` is called exactly as before). An
 * unknown distro falls back to Ubuntu so the golden path is never wedged.
 */
function getDesktopContainer(env: Env, id: string, distro: DistroId): DesktopContainerStub {
  // Cast the `getContainer` REFERENCE (not just its result) so TS never
  // instantiates its deep `DurableObjectStub<DesktopContainer>` proxy return
  // type — that recursive expansion is the TS2589 source. Runtime is unchanged.
  const resolve = getContainer as unknown as (
    binding: Env['DESKTOP'] | Env['DESKTOP_FEDORA'] | Env['DESKTOP_DEBIAN'],
    name: string
  ) => DesktopContainerStub;
  const binding =
    distro === 'fedora'
      ? env.DESKTOP_FEDORA
      : distro === 'debian'
        ? env.DESKTOP_DEBIAN
        : env.DESKTOP;
  return resolve(binding, id);
}

/** Generate a URL-safe desktop id (UUIDv4 — unpredictable, no info leak). */
function newDesktopId(): string {
  return crypto.randomUUID();
}

/** Default label when the user doesn't name the desktop. */
function defaultName(size: keyof typeof DESKTOP_SIZES): string {
  return `${DESKTOP_SIZES[size].friendlyName} desktop`;
}

const app = new Hono<{ Bindings: Env }>();

/**
 * POST /api/v1/desktops — create a desktop.
 * Validates the body, inserts a registry row (status `stopped`), and mints a
 * short-lived VNC ticket the client appends to the VNC URL once the desktop is
 * started. Idempotent at the registry layer (upsert by id).
 */
app.post('/', async (c) => {
  const raw = await c.req.json().catch(() => undefined);
  const parsed = CreateDesktopRequestSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return c.json({ ok: false, error: 'invalid_request', details: parsed.error.flatten() }, 400);
  }
  const { name, size, distro, disposable } = parsed.data;

  const id = newDesktopId();
  const registry = getRegistry(c.env);
  const created: DesktopResource = await registry.create({
    id,
    name: name ?? defaultName(size),
    // OS string is derived from the chosen distro (e.g. "Fedora 41") so the
    // registry's `os` field always matches the distro the container runs.
    os: DISTROS[distro].os,
    distro,
    size,
    status: 'starting',
    persistent: !disposable,
  });

  // Auto-start so `+ New computer` yields a booting→ready desktop in ONE action
  // (embarrassingly-easy UX). `.start()` is non-blocking + idempotent; the first VNC
  // request blocks on websockify readiness, so `ready` here means "boot accepted".
  // Route to the container namespace matching the chosen distro.
  let desktop = created;
  try {
    await getDesktopContainer(c.env, id, distro).start();
    desktop = (await registry.updateStatus(id, 'ready')) ?? created;
  } catch (err) {
    console.error('[deskl.ink desktops] auto-start on create failed', id, err);
    desktop = (await registry.updateStatus(id, 'failed')) ?? created;
  }

  // Ticket carries the distro so the VNC proxy routes to the right container.
  const vncTicket = await mintVncTicket(id, distro, c.env.VNC_TICKET_SECRET);

  const body = CreateDesktopResponseSchema.parse({ desktop, vncTicket });
  return c.json(body, 201);
});

/** GET /api/v1/desktops — list every desktop (newest first). */
app.get('/', async (c) => {
  const desktops = await getRegistry(c.env).list();
  const body = DesktopListResponseSchema.parse({ desktops });
  return c.json(body);
});

/** GET /api/v1/desktops/:id — fetch one desktop; 404 when unknown. */
app.get('/:id', async (c) => {
  const desktop = await getRegistry(c.env).get(c.req.param('id'));
  if (!desktop) return c.json({ ok: false, error: 'not_found' }, 404);
  const body = DesktopResponseSchema.parse({ desktop });
  return c.json(body);
});

/**
 * POST /api/v1/desktops/:id/start — boot the container.
 * Idempotent: `getContainer(...).start()` no-ops if the instance is already
 * running. Sets status `starting` then `ready` once the start command is
 * accepted. 404 for an unknown desktop.
 */
app.post('/:id/start', async (c) => {
  const id = c.req.param('id');
  const registry = getRegistry(c.env);
  const existing = await registry.get(id);
  if (!existing) return c.json({ ok: false, error: 'not_found' }, 404);

  await registry.updateStatus(id, 'starting');
  try {
    // `.start()` is non-blocking + idempotent (safe on an already-running instance).
    // Route to the container namespace for this desktop's distro.
    await getDesktopContainer(c.env, id, existing.distro).start();
  } catch (err) {
    console.error('[deskl.ink desktops] start failed', id, err);
    const failed = await registry.updateStatus(id, 'failed');
    return c.json({ ok: false, error: 'start_failed', desktop: failed }, 502);
  }

  const desktop = await registry.updateStatus(id, 'ready');
  if (!desktop) return c.json({ ok: false, error: 'not_found' }, 404);
  const body = DesktopResponseSchema.parse({ desktop });
  return c.json(body);
});

/**
 * POST /api/v1/desktops/:id/ticket — mint a fresh, short-lived VNC ticket for a desktop.
 * The create response carries a ticket, but a client that opens a desktop WITHOUT one (page
 * reload, reopening a running desktop) needs a way to get a connection — otherwise the connect
 * view dead-ends on a spinner. Ensures the container is running, then mints a distro-scoped
 * ticket. Idempotent + safe to call repeatedly. 404 for an unknown desktop.
 */
app.post('/:id/ticket', async (c) => {
  const id = c.req.param('id');
  const registry = getRegistry(c.env);
  const existing = await registry.get(id);
  if (!existing) return c.json({ ok: false, error: 'not_found' }, 404);

  try {
    // `.start()` is non-blocking + idempotent — guarantees the instance is up before we hand
    // out a ticket (covers "ticket for a stopped desktop" too).
    await getDesktopContainer(c.env, id, existing.distro).start();
  } catch (err) {
    console.error('[deskl.ink desktops] ticket start failed', id, err);
    return c.json({ ok: false, error: 'start_failed' }, 502);
  }
  await registry.updateStatus(id, 'ready');

  const vncTicket = await mintVncTicket(id, existing.distro, c.env.VNC_TICKET_SECRET);
  const body = VncTicketResponseSchema.parse({ vncTicket });
  return c.json(body);
});

/**
 * POST /api/v1/desktops/:id/stop — stop the container (SIGTERM).
 * Idempotent: `.stop()` is a no-op if not running. Sets status `stopped`.
 */
app.post('/:id/stop', async (c) => {
  const id = c.req.param('id');
  const registry = getRegistry(c.env);
  const existing = await registry.get(id);
  if (!existing) return c.json({ ok: false, error: 'not_found' }, 404);

  await registry.updateStatus(id, 'stopping');
  try {
    // Route to the container namespace for this desktop's distro.
    await getDesktopContainer(c.env, id, existing.distro).stop();
  } catch (err) {
    // A stop failure shouldn't wedge the record — log, still mark stopped.
    console.error('[deskl.ink desktops] stop failed', id, err);
  }

  const desktop = await registry.updateStatus(id, 'stopped');
  if (!desktop) return c.json({ ok: false, error: 'not_found' }, 404);
  const body = DesktopResponseSchema.parse({ desktop });
  return c.json(body);
});

/**
 * DELETE /api/v1/desktops/:id — destroy the container and forget the desktop.
 * Idempotent: destroying a stopped/unknown container + removing an unknown row
 * are both no-ops, so a double-delete is safe.
 */
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const registry = getRegistry(c.env);
  // Look up the distro so we destroy the instance in the RIGHT namespace. An
  // unknown desktop has no live container in any namespace — skip the destroy
  // and just ensure the (already-absent) row is removed, keeping this idempotent.
  const existing = await registry.get(id);
  if (existing) {
    try {
      await getDesktopContainer(c.env, id, existing.distro).destroy();
    } catch (err) {
      console.error('[deskl.ink desktops] destroy failed', id, err);
    }
  }
  await registry.remove(id);
  return c.json({ ok: true, id });
});

/**
 * ALL /api/v1/desktops/:id/vnc/* — ticketed VNC proxy (HTTP + WebSocket).
 *
 * Verifies the `?ticket=` query param (HMAC + expiry + desktopId match) and
 * returns 401 on ANY defect. On success it proxies the raw request to the
 * container's websockify on {@link VNC_CONTAINER_PORT} via
 * `getContainer(...).fetch(switchPort(req, port))` — `.fetch` (not
 * `containerFetch`) so WebSocket upgrades pass through bi-directionally.
 */
app.all('/:id/vnc/*', async (c) => {
  const id = c.req.param('id');
  // noVNC loads its JS/CSS as RELATIVE module imports and opens the WebSocket WITHOUT the
  // parent page's `?ticket=` query — so requiring the query on every request 401s every asset
  // and the module graph fails to load. Resolve the ticket from the query OR a path-scoped
  // cookie; the HTML response (below) sets that cookie so assets + ws authenticate automatically.
  const cookieName = `deskl_vnc_${id}`;
  const ticket = c.req.query('ticket') ?? getCookie(c, cookieName);

  const verdict = await verifyVncTicket(ticket, id, c.env.VNC_TICKET_SECRET);
  if (!verdict.ok) {
    console.warn('[deskl.ink vnc] rejected ticket', id, verdict.error);
    return c.json({ ok: false, error: 'unauthorized' }, 401);
  }

  // The verified ticket carries the distro → route to the matching container
  // namespace without re-reading the registry on this hot path.
  const container = getDesktopContainer(c.env, id, verdict.claims.distro);

  // WebSocket upgrades: pass the ORIGINAL request straight to the container's defaultPort
  // (VNC_CONTAINER_PORT = websockify). NO switchPort / NO `new Request` — both reconstruct
  // the request and drop the forbidden Upgrade/Connection headers, so websockify would see a
  // plain GET and 404. websockify proxies a socket on ANY path, so no prefix-strip is needed.
  // The browser sends the path-scoped cookie on the ws handshake, so it stays authenticated.
  if (c.req.header('upgrade')?.toLowerCase() === 'websocket') {
    return container.fetch(c.req.raw);
  }

  // Plain HTTP: strip the `/api/v1/desktops/:id/vnc` route prefix so websockify — which
  // serves noVNC at its OWN root (/vnc.html, /app/*, /core/*) — resolves the static path.
  const url = new URL(c.req.raw.url);
  const prefix = `/api/v1/desktops/${id}/vnc`;
  url.pathname = url.pathname.slice(prefix.length) || '/';
  const upstream = await container.fetch(new Request(url.toString(), c.req.raw));

  // Set the short-lived, path-scoped, HttpOnly ticket cookie so subsequent relative asset
  // requests + the ws handshake authenticate without carrying `?ticket=`. Scoped to THIS
  // desktop's vnc path so it never leaks to another desktop.
  const out = new Response(upstream.body, upstream);
  out.headers.append(
    'Set-Cookie',
    `${cookieName}=${ticket}; Path=${prefix}; HttpOnly; Secure; SameSite=Lax; Max-Age=900`
  );
  return out;
});

export default app;
