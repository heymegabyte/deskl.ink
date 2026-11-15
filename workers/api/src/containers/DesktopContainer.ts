/**
 * DesktopContainer — the live Linux workstation.
 *
 * A Cloudflare Container-enabled Durable Object (one instance per desktop id).
 * It runs the Ubuntu desktop image from `container/ubuntu/Dockerfile`, exposing
 * websockify (noVNC HTML + WebSocket proxy to the local VNC server) on
 * {@link VNC_CONTAINER_PORT}. The control-plane (`routes/desktops.ts`) drives
 * its lifecycle via `getContainer(env.DESKTOP, id)` and proxies VNC traffic to
 * it with `.fetch(switchPort(req, VNC_CONTAINER_PORT))` (NEVER `containerFetch`
 * — only `.fetch` forwards WebSocket upgrades).
 *
 * @remarks
 * - `sleepAfter = '10m'` implements the deskl.ink 10-minute idle auto-stop:
 *   the container hibernates after 10 minutes with no requests. VNC WebSocket
 *   traffic renews the activity timeout, so an in-use desktop never sleeps.
 * - Container DOs REQUIRE SQLite storage — declared via `new_sqlite_classes`
 *   in `wrangler.jsonc` `migrations`.
 */

import { Container } from '@cloudflare/containers';
import {
  VNC_CONTAINER_PORT,
  TTYD_CONTAINER_PORT,
  SessionSnapshotSchema,
  type McpToolName,
  type McpToolResult,
  type Participant,
  type SessionSnapshot,
  type RestoreResult,
  type SnapshotResult,
  type StopWithCheckpointResult,
} from '@deskl/shared';
import type { Env } from '../env.js';
import { SessionCoordinatorState, type ControlResult } from '../control/SessionCoordinatorState.js';
import {
  restoreHome as restoreHomeCore,
  snapshotHome as snapshotHomeCore,
  type HomeBackupBucket,
  type HomeBackupDeps,
} from '../persistence/homeBackup.js';

/** DO storage key holding the persisted per-desktop session coordinator state. */
const SESSION_STATE_KEY = 'control-plane:session' as const;

export class DesktopContainer extends Container<Env> {
  /** websockify (noVNC + ws proxy) port inside the image. See the Dockerfile. */
  override defaultPort = VNC_CONTAINER_PORT;

  /** Idle auto-stop: hibernate 10 min after the last request (VNC ws renews it). */
  override sleepAfter = '10m';

  /** Baseline container env. Per-instance overrides go through `start(startOptions)`. */
  override envVars: Record<string, string> = { VNC_RESOLUTION: '1920x1080' };

  /**
   * Route to the right container port by path. The control-plane sends browser-terminal traffic
   * under a `/term` path; everything else is VNC (the helper default).
   *
   * The terminal MUST be proxied here, IN the DO, not via a `containerFetch(...)` RPC call from the
   * Worker — a WebSocket cannot cross the DO-RPC boundary as a return value (DataCloneError). By
   * proxying inside the DO and returning the Response from THIS `fetch`, the ttyd WebSocket tunnels
   * back through the stub's fetch exactly as the VNC WebSocket does. The `/term` prefix is stripped
   * so ttyd resolves its own `/`, `/ws`, `/token` (it rejects a WS on any other path).
   */
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const marker = '/term';
    const at = url.pathname.indexOf(marker);
    if (at === -1) return super.fetch(request);
    url.pathname = url.pathname.slice(at + marker.length) || '/';
    return this.containerFetch(new Request(url.toString(), request), TTYD_CONTAINER_PORT);
  }

  /** Surface container errors to Worker logs; keep the DO default (rethrow). */
  override onError(error: unknown): never {
    console.error('[deskl.ink DesktopContainer] container error', error);
    throw error;
  }

  /** Lifecycle breadcrumb — container reached a running/healthy state. */
  override onStart(): void {
    console.log('[deskl.ink DesktopContainer] started');
  }

  /** Lifecycle breadcrumb — container shut down (idle-stop, stop, or destroy). */
  override onStop(): void {
    console.log('[deskl.ink DesktopContainer] stopped');
  }

  // -------------------------------------------------------------------------
  // Agent control plane (feature-flagged OFF at the route; the DO itself is
  // always safe to call). The per-desktop DO IS the single session coordinator
  // + input arbiter: it persists the authoritative roster + control holder in
  // `ctx.storage` and runs the PURE `SessionCoordinatorState` rules over it.
  //
  // Each method: load the snapshot → mutate via the arbiter → persist → return
  // a typed result. Load/persist are tiny single-key reads/writes serialized by
  // the DO's single-threaded execution, so no extra locking is needed.
  // -------------------------------------------------------------------------

  /**
   * Rehydrate the arbiter from persisted storage (empty session on first use / after eviction).
   *
   * The persisted blob is UNTRUSTED input to the arbiter's rules, so it is Zod-validated with
   * `SessionSnapshotSchema.safeParse` rather than cast blindly: a corrupt / partially-written /
   * schema-drifted record (e.g. a participant missing its `principal` after a shape change) starts
   * a CLEAN empty session instead of seeding the arbiter with a malformed roster that could defeat
   * the principal-binding check. The failure is logged structured (never silently swallowed).
   */
  private async loadCoordinator(): Promise<SessionCoordinatorState> {
    const raw = await this.ctx.storage.get<unknown>(SESSION_STATE_KEY);
    if (raw === undefined) return SessionCoordinatorState.fromSnapshot(undefined);
    const parsed = SessionSnapshotSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn(
        JSON.stringify({
          at: 'DesktopContainer.loadCoordinator',
          msg: 'discarding malformed persisted session snapshot; starting empty',
          issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), code: i.code })),
        })
      );
      return SessionCoordinatorState.fromSnapshot(undefined);
    }
    return SessionCoordinatorState.fromSnapshot(parsed.data);
  }

  /** Persist the arbiter's current snapshot as the authoritative per-desktop session state. */
  private async saveCoordinator(coord: SessionCoordinatorState): Promise<SessionSnapshot> {
    const snap = coord.snapshot();
    await this.ctx.storage.put(SESSION_STATE_KEY, snap);
    return snap;
  }

  /** Attach a participant (human or agent) to this desktop's session. Returns the new snapshot. */
  async join(p: Participant): Promise<SessionSnapshot> {
    const coord = await this.loadCoordinator();
    coord.join(p);
    return this.saveCoordinator(coord);
  }

  /** Detach a connection; auto-promotes control to the next controller if the holder left. */
  async leave(connId: string): Promise<SessionSnapshot> {
    const coord = await this.loadCoordinator();
    coord.leave(connId);
    return this.saveCoordinator(coord);
  }

  /**
   * Request input control — granted only when control is free. The `connId` must belong to
   * `callerPrincipal` (the authenticated session owner from `resolveAuth`); a cross-principal or
   * absent connId is denied (server-bound identity).
   */
  async requestControl(connId: string, callerPrincipal: string): Promise<ControlResult> {
    const coord = await this.loadCoordinator();
    const result = coord.requestControl(connId, callerPrincipal);
    if (result.ok) await this.saveCoordinator(coord);
    return result;
  }

  /**
   * Hand input control from the current holder to another participant. The caller must OWN
   * `fromConnId` (server-bound identity) AND hold control; the target must be an existing
   * participant (of any principal).
   */
  async handoff(
    fromConnId: string,
    toConnId: string,
    callerPrincipal: string
  ): Promise<ControlResult> {
    const coord = await this.loadCoordinator();
    const result = coord.handoff(fromConnId, toConnId, callerPrincipal);
    if (result.ok) await this.saveCoordinator(coord);
    return result;
  }

  /**
   * Release input control. The `connId` must belong to `callerPrincipal` (a cross-principal connId
   * is denied → `{ ok:false }`); only the actual holder frees control. On an authorized call returns
   * the fresh snapshot (`{ ok:true, snapshot }`); on denial returns `{ ok:false, reason }`.
   */
  async releaseControl(
    connId: string,
    callerPrincipal: string
  ): Promise<{ ok: true; snapshot: SessionSnapshot } | { ok: false; reason: string }> {
    const coord = await this.loadCoordinator();
    const verdict = coord.releaseControl(connId, callerPrincipal);
    if (!verdict.ok) return { ok: false, reason: verdict.reason };
    const snapshot = await this.saveCoordinator(coord);
    return { ok: true, snapshot };
  }

  /** The current session roster + control holder. */
  async getParticipants(): Promise<SessionSnapshot> {
    return (await this.loadCoordinator()).snapshot();
  }

  /**
   * Invoke an MCP tool on behalf of a connection. Authorizes against server-bound identity FIRST
   * (the `connId` must belong to `callerPrincipal`), THEN input control (mutating tools require the
   * control holder; read-only tools allowed to any bound participant); a denied call returns
   * `{ ok:false, kind:'denied' }`.
   *
   * On an AUTHORIZED call the tool would be dispatched to the in-container command daemon — which is
   * NOT built yet (ACP-EXEC) — so we return an HONEST `capability_gap` rather than faking a result.
   * This is a real, typed outcome the caller can branch on, never a thrown error or a stubbed
   * success. When the daemon lands, only this dispatch branch changes.
   */
  async invokeTool(
    toolName: McpToolName,
    _args: unknown,
    connId: string,
    callerPrincipal: string
  ): Promise<McpToolResult> {
    const coord = await this.loadCoordinator();
    const verdict = coord.authorizeTool(connId, toolName, callerPrincipal);
    if (!verdict.ok) {
      return { ok: false, kind: 'denied', reason: verdict.reason };
    }
    return {
      ok: false,
      kind: 'capability_gap',
      tool: toolName,
      reason: 'container command daemon not yet deployed (ACP-EXEC)',
    };
  }

  // -------------------------------------------------------------------------
  // Durable home-volume persistence (P0 "never destroy user work"). The home
  // volume is ephemeral; these methods stream a gzip tar of /home ↔ R2
  // (`BACKUPS`) so it survives an actual container REPLACEMENT, not just a
  // graceful Stop. The in-container backup service (loopback, no R2 creds)
  // produces/consumes the tar; the DO is the ONLY thing that touches R2.
  //
  // The CORE logic lives in the pure, dependency-injected `persistence/
  // homeBackup.ts` (unit-tested without the Workers runtime). Each method here
  // is a thin adapter: guard on BACKUPS being bound, then delegate with
  // `this.env.BACKUPS` + `this.containerFetch` wired as the deps.
  // -------------------------------------------------------------------------

  /**
   * Bind this DO's R2 bucket + container fetch as the pure helper's deps — or `null` when `BACKUPS`
   * is unbound (persistence not configured), so callers can return an HONEST `capability_gap`
   * instead of dereferencing an undefined binding. `containerFetch` is bound to `this`; the pure
   * helper supplies the loopback backup port and try/catches a throw (container down).
   */
  private backupDeps(): HomeBackupDeps | null {
    const bucket = this.env.BACKUPS as HomeBackupBucket | undefined;
    if (!bucket) return null;
    return {
      bucket,
      containerFetch: (request: Request, port: number) => this.containerFetch(request, port),
    };
  }

  /**
   * Snapshot `/home` to R2. Streams the in-container backup service's gzip tar into `BACKUPS` and
   * writes a `latest.json` manifest pointer. Returns a typed {@link SnapshotResult}: a
   * `capability_gap` when R2 is unbound OR the backup service is unreachable (HONEST — never a
   * thrown error / faked success), else `{ ok: true, manifest }`.
   */
  async snapshotHome(desktopId: string): Promise<SnapshotResult> {
    const deps = this.backupDeps();
    if (!deps) {
      return { ok: false, kind: 'capability_gap', reason: 'persistence not configured' };
    }
    return snapshotHomeCore(deps, desktopId);
  }

  /**
   * Restore the most recent `/home` snapshot into the (possibly freshly-replaced) container. Reads
   * `latest.json` from `BACKUPS` and POSTs the pointed-at tar to the backup service's `/restore`.
   * Returns a typed {@link RestoreResult}: `error`/`no_backup` when nothing is stored, a
   * `capability_gap` when R2 is unbound or the service/object is unreachable, else
   * `{ ok: true, restoredKey }`.
   */
  async restoreHome(desktopId: string): Promise<RestoreResult> {
    const deps = this.backupDeps();
    if (!deps) {
      return { ok: false, kind: 'capability_gap', reason: 'persistence not configured' };
    }
    return restoreHomeCore(deps, desktopId);
  }

  /**
   * Checkpoint-before-stop — the durable-persistence invariant. A persistent computer is stopped
   * only after its `/home` snapshot is durably committed to R2. A failed checkpoint leaves the
   * container running so the user can retry without losing the only current copy of their work.
   */
  async stopWithCheckpoint(desktopId: string): Promise<StopWithCheckpointResult> {
    let checkpoint: SnapshotResult;
    try {
      checkpoint = await this.snapshotHome(desktopId);
    } catch (err) {
      console.error(
        '[deskl.ink DesktopContainer] checkpoint snapshot threw; keeping computer running',
        err
      );
      checkpoint = { ok: false, kind: 'error', reason: 'checkpoint_failed' };
    }
    if (!checkpoint.ok) return { stopped: false, checkpoint };
    await this.stop();
    return { stopped: true, checkpoint };
  }
}

/**
 * FedoraDesktop — the Fedora variant of {@link DesktopContainer}.
 *
 * Identical config/behavior (inherits everything); it exists as a DISTINCT
 * class name only so wrangler can bind it to its own image
 * (`container/fedora/Dockerfile`) via a separate `[[containers]]` block + the
 * `DESKTOP_FEDORA` Durable Object binding. Routing lives in `routes/desktops.ts`.
 */
export class FedoraDesktop extends DesktopContainer {}

/**
 * DebianDesktop — the Debian variant of {@link DesktopContainer}.
 *
 * Identical config/behavior (inherits everything); distinct class name only so
 * wrangler binds it to `container/debian/Dockerfile` via its own `[[containers]]`
 * block + the `DESKTOP_DEBIAN` Durable Object binding.
 */
export class DebianDesktop extends DesktopContainer {}

/**
 * Per-SIZE container classes.
 *
 * Cloudflare sets a container's RAM/vCPU via its `instance_type`, and
 * `instance_type` is fixed per container class in wrangler config (there is no
 * per-instance override). So each selectable VM size needs its OWN class bound
 * to the right `instance_type`:
 *
 *   everyday  → standard-1 (4 GiB)   ← the 3 classes above (one per distro)
 *   developer → standard-2 (6 GiB)
 *   power     → standard-3 (8 GiB)
 *   heavy     → standard-4 (12 GiB)
 *
 * Crossed with the 3 distros (image), that's a 3 × 4 matrix. The classes below
 * are the 9 non-`everyday` cells — identical behavior (they inherit everything),
 * distinct class names only so wrangler can bind each to its distro's Dockerfile
 * at the size's `instance_type`. Routing lives in `routes/desktops.ts`.
 */
export class UbuntuDeveloper extends DesktopContainer {}
export class UbuntuPower extends DesktopContainer {}
export class UbuntuHeavy extends DesktopContainer {}

export class FedoraDeveloper extends DesktopContainer {}
export class FedoraPower extends DesktopContainer {}
export class FedoraHeavy extends DesktopContainer {}

export class DebianDeveloper extends DesktopContainer {}
export class DebianPower extends DesktopContainer {}
export class DebianHeavy extends DesktopContainer {}

/**
 * UbuntuServer — the headless SERVER form (spec §9): Ubuntu + ttyd, NO desktop/VNC.
 *
 * Inherits DesktopContainer's `/term`→ttyd fetch routing, so the Worker's terminal proxy works
 * identically. It's bound (in wrangler) to the LEAN `container/ubuntu-server/Dockerfile` instead of
 * the KDE image, so there is no websockify/VNC on :6080 — a server's workspace is the terminal, not
 * a remote desktop. `everyday` size (standard-1) for v1; more sizes are additive classes later.
 */
export class UbuntuServer extends DesktopContainer {}

/** Fedora / Debian server variants — bound (in wrangler) to their own lean server images. */
export class FedoraServer extends DesktopContainer {}
export class DebianServer extends DesktopContainer {}
