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

import { Hono, type Context } from 'hono';
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
  type ComputerForm,
  type DesktopResource,
  type DistroId,
  type DesktopSizeId,
} from '@deskl/shared';
import type { Env } from '../env.js';
import type { DesktopRegistry } from '../containers/DesktopRegistry.js';
import { imageKeyFor, instanceFor } from '../compute/catalog.js';
import { resolvePrincipal, principalCookie, isAdmin } from '../auth/principal.js';
import { mintVncTicket, verifyVncTicket } from './vnc-ticket.js';

/**
 * Resolve the caller's owning principal + admin flag, and set the signed session cookie when it's
 * freshly minted (so the browser gets a stable identity on its first API call). Every ownership
 * check in this control-plane keys off `id`. See auth/principal.ts.
 */
async function principalOf(c: Context<{ Bindings: Env }>): Promise<{ id: string; admin: boolean }> {
  const p = await resolvePrincipal(c, c.env.VNC_TICKET_SECRET);
  if (p.fresh) c.header('Set-Cookie', await principalCookie(p.id, c.env.VNC_TICKET_SECRET));
  return { id: p.id, admin: isAdmin(c, c.env.ADMIN_TOKEN) };
}

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

// ---------------------------------------------------------------------------
// Compute backend. TWO implementations behind one `Lifecycle` surface + a flag:
//
//   DEFAULT (flag off)      → the proven 12-class `default`-policy helper fleet (live golden path).
//   COMPUTER_DO === '1'     → the universal `Computer` DO (durable_object policy, ADR-0002).
//
// The Computer path is fully deployed + wired but FLAG-GATED OFF: under the durable_object policy
// `ctx.container.start({ image, instance })` returns but launches 0 instances (the `images` map is
// present at runtime, but the multi-image runtime LAUNCH/size-selection call isn't confirmable from
// current public docs — see docs/adr/0002 § Blocker). Flip `COMPUTER_DO=1` (a wrangler var) to
// re-test once that's resolved, with NO change to the control-plane below.
// ---------------------------------------------------------------------------

/** Uniform lifecycle + proxy surface the routes drive, regardless of compute backend. */
interface Lifecycle {
  start(): Promise<void>;
  stop(): Promise<void>;
  destroy(): Promise<void>;
  /** Proxy to the desktop's VNC (websockify) port. */
  fetch(req: Request): Response | Promise<Response>;
  /** Proxy to the desktop's browser-terminal (ttyd) port. */
  termFetch(req: Request): Response | Promise<Response>;
}

/** The RPC surface the control-plane drives on a Computer DO (durable_object path). */
interface ComputerStub {
  configure(config: { imageKey: string; instance: string; env?: Record<string, string> }): Promise<void>;
  startComputer(): Promise<void>;
  stopComputer(): Promise<void>;
  destroyComputer(): Promise<void>;
  fetch(req: Request): Response | Promise<Response>;
}

/** Resolve the universal Computer DO stub (one DO per id). Cast breaks the TS2589 deep inference. */
function getComputer(env: Env, id: string): ComputerStub {
  const nsId = env.COMPUTER.idFromName(id);
  return env.COMPUTER.get(nsId) as unknown as ComputerStub;
}

/** The container-lifecycle surface on a DesktopContainer (default-policy helper path). */
interface DesktopContainerStub {
  start(): Promise<void>;
  stop(): Promise<void>;
  destroy(): Promise<void>;
  /** Stub `.fetch` — the ONLY WS-capable path. The DO routes by path: `/term` → ttyd, else VNC. */
  fetch(req: Request): Response | Promise<Response>;
}

/**
 * Resolve the DesktopContainer stub for a desktop, routed by (distro × size). Each (distro, size)
 * is a DISTINCT Durable Object namespace — distro picks the image, size picks the Cloudflare
 * `instance_type` (RAM), both fixed per class. Unknown distro/size fall back to ubuntu/everyday.
 * The `getContainer` stub-proxy type expands recursively under `exactOptionalPropertyTypes`
 * (TS2589); narrowing to `DesktopContainerStub` breaks that once, here, without runtime change.
 */
function getDesktopContainer(
  env: Env,
  id: string,
  distro: DistroId,
  size: DesktopSizeId,
  form: ComputerForm
): DesktopContainerStub {
  const resolve = getContainer as unknown as (
    binding: Env['DESKTOP'],
    name: string
  ) => DesktopContainerStub;
  return resolve(desktopNamespace(env, distro, size, form), id);
}

/**
 * (distro × size × form) → the Durable Object namespace bound to that image + instance_type. The
 * cast collapses the structurally-identical namespace types to one; selection is a plain lookup.
 * A `server` computer is the headless Ubuntu image (one class for v1), regardless of distro/size.
 */
function desktopNamespace(
  env: Env,
  distro: DistroId,
  size: DesktopSizeId,
  form: ComputerForm
): Env['DESKTOP'] {
  if (form === 'server') return env.DESKTOP_UBUNTU_SERVER as unknown as Env['DESKTOP'];
  const grid = {
    ubuntu: {
      everyday: env.DESKTOP,
      developer: env.DESKTOP_UBUNTU_DEVELOPER,
      power: env.DESKTOP_UBUNTU_POWER,
      heavy: env.DESKTOP_UBUNTU_HEAVY,
    },
    fedora: {
      everyday: env.DESKTOP_FEDORA,
      developer: env.DESKTOP_FEDORA_DEVELOPER,
      power: env.DESKTOP_FEDORA_POWER,
      heavy: env.DESKTOP_FEDORA_HEAVY,
    },
    debian: {
      everyday: env.DESKTOP_DEBIAN,
      developer: env.DESKTOP_DEBIAN_DEVELOPER,
      power: env.DESKTOP_DEBIAN_POWER,
      heavy: env.DESKTOP_DEBIAN_HEAVY,
    },
  } as unknown as Record<DistroId, Record<DesktopSizeId, Env['DESKTOP']>>;
  return grid[distro]?.[size] ?? grid.ubuntu.everyday;
}

/** Resolve the compute backend for a computer — Computer DO when `COMPUTER_DO=1`, else the fleet. */
function lifecycleFor(
  env: Env,
  id: string,
  distro: DistroId,
  size: DesktopSizeId,
  form: ComputerForm
): Lifecycle {
  if (env.COMPUTER_DO === '1') {
    const comp = getComputer(env, id);
    return {
      start: async () => {
        // Persist image + instance, then boot. Registry (distro, size, form) stays authoritative.
        await comp.configure({ imageKey: imageKeyFor(distro, form), instance: instanceFor(size) });
        await comp.startComputer();
      },
      stop: () => comp.stopComputer(),
      destroy: () => comp.destroyComputer(),
      fetch: (req) => comp.fetch(req),
      // Second-port (terminal) proxy isn't wired on the Computer DO yet — its fetch() is hardwired
      // to the VNC port, and a WS-safe port switch needs a dedicated path. COMPUTER_DO is off, so
      // this is never hit in prod; return a clear 503 rather than mis-proxy to VNC.
      termFetch: () =>
        new Response('Terminal is not available on the Computer backend yet.', { status: 503 }),
    };
  }
  const cont = getDesktopContainer(env, id, distro, size, form);
  return {
    start: () => cont.start(),
    stop: () => cont.stop(),
    destroy: () => cont.destroy(),
    fetch: (req) => cont.fetch(req),
    // Terminal also goes through the WS-capable `.fetch` (NOT containerFetch — a WS can't return
    // across DO-RPC). The DO's `fetch` routes `/term` paths to ttyd, so we forward the request with
    // its `/term` prefix INTACT and let the DO strip it.
    termFetch: (req) => cont.fetch(req),
  };
}

/** Generate a URL-safe desktop id (UUIDv4 — unpredictable, no info leak). */
function newDesktopId(): string {
  return crypto.randomUUID();
}

/** Default label when the user doesn't name the computer, e.g. "Everyday desktop" / "Everyday server". */
function defaultName(size: keyof typeof DESKTOP_SIZES, form: ComputerForm): string {
  return `${DESKTOP_SIZES[size].friendlyName} ${form}`;
}

const app = new Hono<{ Bindings: Env }>();

/**
 * POST /api/v1/desktops — create a desktop.
 * Validates the body, inserts a registry row (status `stopped`), and mints a
 * short-lived VNC ticket the client appends to the VNC URL once the desktop is
 * started. Idempotent at the registry layer (upsert by id).
 */
app.post('/', async (c) => {
  const { id: principalId } = await principalOf(c);
  const registry = getRegistry(c.env);

  // Cost-abuse guard (runs BEFORE body-parse + any container spin-up): there is no auth boundary
  // yet, so cap create attempts per client IP AND globally so an unauthenticated caller can't spin
  // up unbounded billable containers. Counts EVERY POST attempt (incl. malformed) — this is abuse
  // protection, not request validation. See docs/product/deskl-converged-spec.md § security. The
  // standing monitor creates ~1/fire, far under these limits.
  const ip = c.req.header('cf-connecting-ip') ?? 'anon';
  const ipGate = await registry.checkRate(`create:ip:${ip}`, 6, 60_000);
  const gate = ipGate.allowed ? await registry.checkRate('create:global', 30, 60_000) : ipGate;
  if (!gate.allowed) {
    c.header('Retry-After', String(gate.retryAfterSec));
    return c.json(
      {
        ok: false,
        error: 'rate_limited',
        message: 'Too many new computers too quickly — wait a few seconds and try again.',
      },
      429
    );
  }

  const raw = await c.req.json().catch(() => undefined);
  const parsed = CreateDesktopRequestSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return c.json({ ok: false, error: 'invalid_request', details: parsed.error.flatten() }, 400);
  }
  const { name, size, distro, form, disposable } = parsed.data;

  const id = newDesktopId();
  const created: DesktopResource = await registry.create({
    id,
    name: name ?? defaultName(size, form),
    // OS string is derived from the chosen distro (e.g. "Fedora 41") so the
    // registry's `os` field always matches the distro the container runs.
    os: DISTROS[distro].os,
    distro,
    size,
    form,
    status: 'starting',
    persistent: !disposable,
    owner: principalId,
  });

  // Auto-start so `+ New computer` yields a booting→ready desktop in ONE action
  // (embarrassingly-easy UX). `.start()` is non-blocking + idempotent; the first VNC
  // request blocks on websockify readiness, so `ready` here means "boot accepted".
  // Route to the container namespace matching the chosen distro.
  let desktop = created;
  try {
    // Boot the computer on the active backend (12-class fleet / server class by default; Computer
    // DO when COMPUTER_DO=1). `.start()` is non-blocking + idempotent; `ready` = "boot accepted".
    await lifecycleFor(c.env, id, distro, size, form).start();
    desktop = (await registry.updateStatus(id, 'ready')) ?? created;
  } catch (err) {
    console.error('[deskl.ink desktops] auto-start on create failed', id, err);
    desktop = (await registry.updateStatus(id, 'failed')) ?? created;
  }

  // Ticket carries distro + size + form so the VNC/terminal proxy routes to the right container.
  const vncTicket = await mintVncTicket(id, distro, size, form, c.env.VNC_TICKET_SECRET);

  const body = CreateDesktopResponseSchema.parse({ desktop, vncTicket });
  return c.json(body, 201);
});

/** GET /api/v1/desktops — list the CALLER'S desktops (newest first); admin sees all. */
app.get('/', async (c) => {
  const { id: principalId, admin } = await principalOf(c);
  const desktops = await getRegistry(c.env).list(admin ? undefined : principalId);
  const body = DesktopListResponseSchema.parse({ desktops });
  return c.json(body);
});

/** GET /api/v1/desktops/:id — fetch one desktop the caller owns; 404 when unknown OR not owned. */
app.get('/:id', async (c) => {
  const { id: principalId, admin } = await principalOf(c);
  const registry = getRegistry(c.env);
  const id = c.req.param('id');
  const desktop = admin ? await registry.get(id) : await registry.getOwned(id, principalId);
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
  const { id: principalId, admin } = await principalOf(c);
  const registry = getRegistry(c.env);
  const existing = admin ? await registry.get(id) : await registry.getOwned(id, principalId);
  if (!existing) return c.json({ ok: false, error: 'not_found' }, 404);

  await registry.updateStatus(id, 'starting');
  try {
    // Idempotent on both backends (no-op if already running).
    await lifecycleFor(c.env, id, existing.distro, existing.size, existing.form).start();
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
  const { id: principalId, admin } = await principalOf(c);
  const registry = getRegistry(c.env);
  const existing = admin ? await registry.get(id) : await registry.getOwned(id, principalId);
  if (!existing) return c.json({ ok: false, error: 'not_found' }, 404);

  try {
    // Ensure the instance is up before handing out a ticket (covers "ticket for a stopped
    // desktop" too). Idempotent on both backends.
    await lifecycleFor(c.env, id, existing.distro, existing.size, existing.form).start();
  } catch (err) {
    console.error('[deskl.ink desktops] ticket start failed', id, err);
    return c.json({ ok: false, error: 'start_failed' }, 502);
  }
  await registry.updateStatus(id, 'ready');

  const vncTicket = await mintVncTicket(
    id,
    existing.distro,
    existing.size,
    existing.form,
    c.env.VNC_TICKET_SECRET
  );
  const body = VncTicketResponseSchema.parse({ vncTicket });
  return c.json(body);
});

/**
 * POST /api/v1/desktops/:id/stop — stop the container (SIGTERM).
 * Idempotent: `.stop()` is a no-op if not running. Sets status `stopped`.
 */
app.post('/:id/stop', async (c) => {
  const id = c.req.param('id');
  const { id: principalId, admin } = await principalOf(c);
  const registry = getRegistry(c.env);
  const existing = admin ? await registry.get(id) : await registry.getOwned(id, principalId);
  if (!existing) return c.json({ ok: false, error: 'not_found' }, 404);

  await registry.updateStatus(id, 'stopping');
  try {
    await lifecycleFor(c.env, id, existing.distro, existing.size, existing.form).stop();
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
  const { id: principalId, admin } = await principalOf(c);
  const registry = getRegistry(c.env);
  // Authorize: only the OWNER (or admin) may destroy. Unknown OR not-owned → 404 (no cross-owner
  // destroy, and no existence-probing of another principal's computer). Destroy BEFORE removing
  // the row so a GET during teardown 404s only once the container is actually gone.
  const existing = admin ? await registry.get(id) : await registry.getOwned(id, principalId);
  if (!existing) return c.json({ ok: false, error: 'not_found' }, 404);
  try {
    await lifecycleFor(c.env, id, existing.distro, existing.size, existing.form).destroy();
  } catch (err) {
    console.error('[deskl.ink desktops] destroy failed', id, err);
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

  // Resolve the compute backend from the ticket's (distro, size) claims — routes the 12-class
  // fleet to the right namespace, or (COMPUTER_DO=1) the single Computer DO by id.
  const container = lifecycleFor(c.env, id, verdict.claims.distro, verdict.claims.size, verdict.claims.form);

  // WebSocket upgrades: pass the ORIGINAL request straight through (NO switchPort / NO new Request
  // at this layer — both drop the forbidden Upgrade/Connection headers, so websockify would see a
  // plain GET and 404). websockify proxies a socket on ANY path, so no prefix-strip is needed. The
  // browser sends the path-scoped cookie on the ws handshake, so it stays authenticated.
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

/**
 * ALL /api/v1/desktops/:id/term/* — ticketed browser-terminal proxy (HTTP + WebSocket).
 *
 * Same signed-ticket auth as the VNC route: a desktop-scoped ticket authorizes BOTH that desktop's
 * VNC and terminal (a VNC desktop user already has a full shell via a terminal app, so this adds no
 * privilege). Proxies to the container's ttyd on TTYD_CONTAINER_PORT. ttyd serves a single
 * self-contained HTML and builds its `token`/`ws` URLs RELATIVE to the page path, so the same
 * strip-prefix + path-scoped-cookie pattern as VNC authenticates everything.
 */
app.all('/:id/term/*', async (c) => {
  const id = c.req.param('id');
  const cookieName = `deskl_term_${id}`;
  const ticket = c.req.query('ticket') ?? getCookie(c, cookieName);

  const verdict = await verifyVncTicket(ticket, id, c.env.VNC_TICKET_SECRET);
  if (!verdict.ok) {
    console.warn('[deskl.ink term] rejected ticket', id, verdict.error);
    return c.json({ ok: false, error: 'unauthorized' }, 401);
  }

  const container = lifecycleFor(c.env, id, verdict.claims.distro, verdict.claims.size, verdict.claims.form);

  // Forward the request with its `/term` prefix INTACT through the WS-capable stub `.fetch` — do
  // NOT reconstruct/strip it here, which would drop the WebSocket upgrade. The DesktopContainer DO
  // detects `/term`, strips it so ttyd sees its own `/`, `/ws`, `/token` (ttyd rejects a WS on any
  // other path — confirmed locally), and proxies to ttyd in-DO so the WS tunnels back.
  const isWs = c.req.header('upgrade')?.toLowerCase() === 'websocket';
  const prefix = `/api/v1/desktops/${id}/term`;
  const upstream = await container.termFetch(c.req.raw);

  // A WS upgrade (101) is returned as-is — the cookie was set on the HTML load and rides the ws
  // handshake. For HTTP, set the short-lived, path-scoped, HttpOnly cookie so ttyd's relative
  // `token` + `ws` requests (which don't carry `?ticket=`) authenticate.
  if (isWs) return upstream;
  const out = new Response(upstream.body, upstream);
  out.headers.append(
    'Set-Cookie',
    `${cookieName}=${ticket}; Path=${prefix}; HttpOnly; Secure; SameSite=Lax; Max-Age=900`
  );
  return out;
});

export default app;
