/**
 * Agent control plane — the `POST /api/v1/desktops/:id/mcp` endpoint.
 *
 * ONE JSON-RPC-ish method envelope drives the per-desktop Durable Object acting as the single
 * session coordinator + input arbiter. It converges three features onto that DO:
 *   1. desktop-as-MCP tool surface  — `tools/list` + `tools/call`.
 *   2. multiple simultaneous connections — `control/join` | `control/leave` | `participants/list`.
 *   3. human↔AI control handoff     — `control/request` | `control/handoff` | `control/release`.
 *
 * GATING (defense in depth, in order):
 *   - FLAG: `env.AGENT_CONTROL_PLANE !== '1'` → 404 (never 403). The whole surface is dark until
 *     the flag is flipped, so a probe can't even tell the route exists (mirrors COMPUTER_DO).
 *   - AUTH: `resolveAuth` → 401 without a signed session (deskl.ink has no anonymous access).
 *   - OWNERSHIP: the desktop is resolved via the SAME registry `getOwned`/`get` pattern as
 *     `desktops.ts`, so a non-owner (or an unknown id) is indistinguishable → 404.
 *
 * SERVER-BOUND IDENTITY (the P0 fix): the route NEVER trusts a client-supplied `connId`/`role`/
 * `principal` for authorization. A client first calls `control/join`, where the route mints the
 * `connId` server-side, binds it to `principal = auth.id`, and sets `kind`/`role` by server policy;
 * the minted `connId` is returned opaquely. Every subsequent SCOPED op (`tools/call`, `control/
 * request`|`handoff`|`release`, `control/leave`) passes that opaque `connId`, and the coordinator
 * authorizes it ONLY when `participants.get(connId).principal === auth.id` — so a caller can neither
 * drive another principal's connection nor forge a role.
 *
 * Every body is Zod-validated at the boundary (`McpRequestSchema` + per-tool arg schemas), and the
 * DO returns typed contract results (`McpToolResult` / `SessionSnapshot` / control results). The
 * tool calls honestly report a `capability_gap` until the container command daemon (ACP-EXEC) lands.
 *
 * Mounted at `/api/v1/desktops` in `../index.ts` (AFTER the `desktops` sub-app, same base).
 */

import { Hono } from 'hono';
import { getContainer } from '@cloudflare/containers';
import {
  MCP_TOOL_DESCRIPTORS,
  MCP_TOOL_ARG_SCHEMAS,
  McpToolNameSchema,
  type DesktopResource,
  type DistroId,
  type DesktopSizeId,
  type ComputerForm,
  type McpToolResult,
  type Participant,
  type SessionSnapshot,
} from '@deskl/shared';
import { z } from 'zod';
import type { Env } from '../env.js';
import type { AppContext } from '../observability.js';
import type { ControlResult } from '../control/SessionCoordinatorState.js';
import { resolveAuth, getRegistry } from './desktops.js';

/**
 * The coordinator RPC surface on a DesktopContainer DO (the methods added in DesktopContainer.ts).
 * Narrowed explicitly: the `getContainer` stub-proxy type expands recursively under
 * `exactOptionalPropertyTypes` (TS2589), so — exactly as `desktops.ts` does for the lifecycle
 * surface — we cast to this focused interface once, here, with no runtime change.
 */
interface CoordinatorStub {
  join(p: unknown): Promise<SessionSnapshot>;
  leave(connId: string): Promise<SessionSnapshot>;
  requestControl(connId: string, callerPrincipal: string): Promise<ControlResult>;
  handoff(fromConnId: string, toConnId: string, callerPrincipal: string): Promise<ControlResult>;
  releaseControl(
    connId: string,
    callerPrincipal: string
  ): Promise<{ ok: true; snapshot: SessionSnapshot } | { ok: false; reason: string }>;
  getParticipants(): Promise<SessionSnapshot>;
  invokeTool(
    toolName: unknown,
    args: unknown,
    connId: string,
    callerPrincipal: string
  ): Promise<McpToolResult>;
}

/**
 * (distro × size × form) → the DO namespace bound to that image + instance_type. Mirrors
 * `desktops.ts`'s selection (the coordinator state lives on whichever namespace a desktop runs on).
 * A `server` computer uses the headless classes; everything else the desktop grid. Unknown values
 * fall back to ubuntu/everyday — identical fallback to the lifecycle path.
 */
function desktopNamespace(
  env: Env,
  distro: DistroId,
  size: DesktopSizeId,
  form: ComputerForm
): Env['DESKTOP'] {
  if (form === 'server') {
    const servers = {
      ubuntu: env.DESKTOP_UBUNTU_SERVER,
      fedora: env.DESKTOP_FEDORA_SERVER,
      debian: env.DESKTOP_DEBIAN_SERVER,
    } as unknown as Record<DistroId, Env['DESKTOP']>;
    return servers[distro] ?? (env.DESKTOP_UBUNTU_SERVER as unknown as Env['DESKTOP']);
  }
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

/** Resolve the coordinator DO stub for a desktop, routed by its (distro × size × form). */
function getCoordinator(env: Env, desktop: DesktopResource): CoordinatorStub {
  const resolve = getContainer as unknown as (
    binding: Env['DESKTOP'],
    name: string
  ) => CoordinatorStub;
  return resolve(desktopNamespace(env, desktop.distro, desktop.size, desktop.form), desktop.id);
}

// --- Request envelope ------------------------------------------------------

/** The RPC methods the control-plane endpoint accepts. */
const MCP_METHODS = [
  'tools/list',
  'tools/call',
  'participants/list',
  'control/join',
  'control/leave',
  'control/request',
  'control/handoff',
  'control/release',
] as const;

/**
 * The request body: a `method` + optional `params`. `params` is validated per-method below (a
 * discriminated schema would over-couple the methods' disjoint params, so we validate `method`
 * strictly here then branch). For scoped ops the client passes ONLY an opaque `connId` (the key the
 * server minted for it at `control/join`); it NEVER passes `role`/`principal` — those are server
 * policy, derived from the authenticated session, not from the body.
 */
const McpRequestSchema = z
  .object({
    method: z.enum(MCP_METHODS),
    params: z.record(z.unknown()).optional(),
  })
  .strict();

/**
 * `control/join` params — the ONLY client-supplied field is an optional human-friendly `label`.
 * `connId`, `principal`, `kind`, and `role` are ALL server-minted (see the handler), so they are
 * deliberately absent here and rejected if sent (`.strict()`). This is what makes identity
 * server-bound: a client cannot assert who it is or what role it gets.
 */
const JoinParamsSchema = z.object({ label: z.string().min(1).max(120).optional() }).strict();
/** `connId` — the caller's per-connection key in the coordinator (required by scoped methods). */
const ConnIdSchema = z.object({ connId: z.string().min(1) }).strict();
/** `tools/call` params. */
const ToolCallParamsSchema = z
  .object({
    name: McpToolNameSchema,
    args: z.record(z.unknown()).default({}),
    connId: z.string().min(1),
  })
  .strict();
/** `control/handoff` params. */
const HandoffParamsSchema = z
  .object({
    connId: z.string().min(1),
    toConnId: z.string().min(1),
  })
  .strict();

const app = new Hono<AppContext>();

/**
 * POST /api/v1/desktops/:id/mcp — the single agent-control-plane entrypoint.
 */
app.post('/:id/mcp', async (c) => {
  // 1) FLAG — dark by default. 404 (not 403) so the surface is invisible when off.
  if (c.env.AGENT_CONTROL_PLANE !== '1') {
    return c.json({ ok: false, error: 'not_found' }, 404);
  }

  // 2) AUTH — no anonymous access to the control plane.
  const auth = await resolveAuth(c);
  if (!auth) return c.json({ ok: false, error: 'unauthorized' }, 401);
  const { id: principalId, admin } = auth;

  // 3) OWNERSHIP — unknown OR not-owned is the same 404 (no cross-owner probing). Same registry
  //    pattern as desktops.ts: admins (ops) resolve unscoped, everyone else owner-scoped.
  const id = c.req.param('id');
  const registry = getRegistry(c.env);
  const desktop = admin ? await registry.get(id) : await registry.getOwned(id, principalId);
  if (!desktop) return c.json({ ok: false, error: 'not_found' }, 404);

  // 4) Validate the envelope.
  const raw = await c.req.json().catch(() => undefined);
  const parsed = McpRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'invalid_request', details: parsed.error.flatten() }, 400);
  }
  const { method, params } = parsed.data;
  const coord = getCoordinator(c.env, desktop);

  // 5) Route to the coordinator RPC. Each branch validates its own params then returns a typed
  //    contract result.
  switch (method) {
    case 'tools/list':
      // Static catalog — no params, no DO round-trip. `mutating` tells a viewer-role client which
      // tools it may not call yet.
      return c.json({ ok: true, tools: MCP_TOOL_DESCRIPTORS });

    case 'tools/call': {
      const p = ToolCallParamsSchema.safeParse(params ?? {});
      if (!p.success) {
        return c.json({ ok: false, error: 'invalid_params', details: p.error.flatten() }, 400);
      }
      // Validate the tool's ARGS against its per-tool schema at the boundary (Zod-everywhere) so a
      // malformed call never reaches the coordinator / future command daemon.
      const argSchema = MCP_TOOL_ARG_SCHEMAS[p.data.name];
      const argCheck = argSchema.safeParse(p.data.args);
      if (!argCheck.success) {
        return c.json(
          { ok: false, error: 'invalid_tool_args', details: argCheck.error.flatten() },
          400
        );
      }
      // The caller proves identity with the server-minted connId; the coordinator rejects it unless
      // that connId belongs to THIS authenticated principal (server-bound identity).
      const result = await coord.invokeTool(
        p.data.name,
        argCheck.data,
        p.data.connId,
        principalId
      );
      return c.json({ ok: true, result });
    }

    case 'participants/list': {
      const snapshot = await coord.getParticipants();
      return c.json({ ok: true, snapshot });
    }

    case 'control/join': {
      // Server-minted, principal-bound identity. The route NEVER reads connId/principal/kind/role
      // from the body — it derives `principal` from the authenticated session, mints a fresh
      // `connId` server-side, and sets `kind='human'` + `role='controller'` by POLICY (the desktop
      // owner attaching is the controller). Only an optional `label` comes from the client.
      const p = JoinParamsSchema.safeParse(params ?? {});
      if (!p.success) {
        return c.json({ ok: false, error: 'invalid_params', details: p.error.flatten() }, 400);
      }
      const connId = crypto.randomUUID();
      const participant: Participant = {
        connId,
        principal: principalId,
        kind: 'human',
        role: 'controller',
        attachedAt: new Date().toISOString(),
        ...(p.data.label ? { label: p.data.label } : {}),
      };
      const snapshot = await coord.join(participant);
      return c.json({ ok: true, connId, snapshot });
    }

    case 'control/leave': {
      const p = ConnIdSchema.safeParse(params ?? {});
      if (!p.success) {
        return c.json({ ok: false, error: 'invalid_params', details: p.error.flatten() }, 400);
      }
      // Verify ownership BEFORE detaching: a client may only leave a connId it owns. Check the live
      // roster so one principal can't evict another's connection. Unknown/cross-principal connId →
      // the same `not_your_participant` denial used by every scoped op (no roster probing).
      const roster = await coord.getParticipants();
      const mine = roster.participants.find(
        (x) => x.connId === p.data.connId && x.principal === principalId
      );
      if (!mine) {
        return c.json({ ok: true, result: { ok: false, reason: 'not_your_participant' } });
      }
      const snapshot = await coord.leave(p.data.connId);
      return c.json({ ok: true, snapshot });
    }

    case 'control/request': {
      const p = ConnIdSchema.safeParse(params ?? {});
      if (!p.success) {
        return c.json({ ok: false, error: 'invalid_params', details: p.error.flatten() }, 400);
      }
      const result = await coord.requestControl(p.data.connId, principalId);
      return c.json({ ok: true, result });
    }

    case 'control/handoff': {
      const p = HandoffParamsSchema.safeParse(params ?? {});
      if (!p.success) {
        return c.json({ ok: false, error: 'invalid_params', details: p.error.flatten() }, 400);
      }
      const result = await coord.handoff(p.data.connId, p.data.toConnId, principalId);
      return c.json({ ok: true, result });
    }

    case 'control/release': {
      const p = ConnIdSchema.safeParse(params ?? {});
      if (!p.success) {
        return c.json({ ok: false, error: 'invalid_params', details: p.error.flatten() }, 400);
      }
      const result = await coord.releaseControl(p.data.connId, principalId);
      if (!result.ok) return c.json({ ok: true, result: { ok: false, reason: result.reason } });
      return c.json({ ok: true, snapshot: result.snapshot });
    }
  }
});

export default app;
