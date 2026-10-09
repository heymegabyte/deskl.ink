/**
 * SessionCoordinatorState — the PURE input arbiter for one desktop's session.
 *
 * This is the brain of the agent control plane, deliberately free of ANY Workers / Durable Object
 * / DOM dependency so it is trivially unit-testable in isolation. The Durable Object
 * (`DesktopContainer`) owns the DURABILITY (load this from `ctx.storage`, mutate, persist); this
 * class owns the RULES:
 *
 *   - MANY participants may attach at once (feature #2 — multiple simultaneous connections).
 *   - EXACTLY ONE participant holds INPUT control at a time (feature #3 — human↔AI handoff); the
 *     rest are live viewers.
 *   - A tool call is authorized against control (feature #1 — desktop-as-MCP): mutating tools
 *     require the caller to be the control holder; read-only tools are allowed to any participant.
 *
 * Every method returns a plain value (snapshot or a tagged ok/deny result) — no exceptions for
 * control-flow — so the DO can translate directly to a typed contract result.
 */
import {
  isMutatingTool,
  type McpToolName,
  type Participant,
  type SessionSnapshot,
} from '@deskl/shared';

/** Outcome of a control-mutation attempt (request / handoff). */
export type ControlResult = { ok: true; holder: string } | { ok: false; reason: string };

/** Outcome of a tool authorization check. */
export type AuthorizeResult = { ok: true } | { ok: false; denied: true; reason: string };

/**
 * The deny reason returned whenever a caller presents a `connId` that is not THEIRS — either the
 * connId is absent from the roster, or it belongs to a different authenticated principal. This is
 * the heart of server-bound identity: a client never authorizes by asserting a role/principal, only
 * by presenting an opaque connId the server MINTED for that same principal (see the route's
 * `control/join`). Cross-principal connId reuse is indistinguishable from a forged connId, so both
 * collapse to this single reason.
 */
export const NOT_YOUR_PARTICIPANT = 'not_your_participant' as const;

/**
 * The serializable form persisted by the DO (`ctx.storage`). A `Map` isn't structured-clone-stable
 * across the storage boundary in a future-proof way, so the DO stores this plain shape and rehydrates
 * via {@link SessionCoordinatorState.fromSnapshot}.
 */
export type PersistedSessionState = SessionSnapshot;

export class SessionCoordinatorState {
  /** Attached connections, keyed by `connId`. Insertion order = join order (drives auto-promote). */
  private readonly participants = new Map<string, Participant>();
  /** The `connId` currently holding input control, or `null` when control is free. */
  private controlHolder: string | null = null;

  /** Rehydrate an arbiter from a persisted snapshot (DO cold start / after an eviction). */
  static fromSnapshot(snap: PersistedSessionState | undefined): SessionCoordinatorState {
    const state = new SessionCoordinatorState();
    if (!snap) return state;
    for (const p of snap.participants) state.participants.set(p.connId, p);
    // Only honor a persisted holder that is still a present participant (defensive against a
    // snapshot where the holder left without being cleared).
    state.controlHolder =
      snap.controlHolder && state.participants.has(snap.controlHolder) ? snap.controlHolder : null;
    return state;
  }

  /**
   * Attach a participant. Re-joining with the same `connId` replaces the prior record (idempotent
   * reconnect). If control is currently FREE and this participant joins as a `controller`, it
   * immediately becomes the holder (the first controller to arrive drives). Returns the snapshot.
   */
  join(p: Participant): SessionSnapshot {
    this.participants.set(p.connId, p);
    if (this.controlHolder === null && p.role === 'controller') {
      this.controlHolder = p.connId;
    }
    return this.snapshot();
  }

  /**
   * Detach a connection. If it held control, control is released and AUTO-PROMOTED to the
   * next-joined remaining `controller` participant (if any), else left free. Removing an unknown
   * connId is a no-op. Returns the snapshot.
   */
  leave(connId: string): SessionSnapshot {
    const wasHolder = this.controlHolder === connId;
    this.participants.delete(connId);
    if (wasHolder) {
      this.controlHolder = null;
      for (const p of this.participants.values()) {
        if (p.role === 'controller') {
          this.controlHolder = p.connId;
          break;
        }
      }
    }
    return this.snapshot();
  }

  /**
   * SERVER-BOUND IDENTITY GUARD. A `connId` authorizes a scoped op ONLY when it is present in the
   * roster AND its participant's `principal` equals the caller's authenticated principal (`auth.id`,
   * threaded by the DO from `resolveAuth`). A connId that is absent, or that belongs to a different
   * principal, is rejected identically — a client can neither drive another principal's connection
   * nor probe which connIds exist. Returns the bound participant on success for the caller to use.
   */
  private boundParticipant(connId: string, callerPrincipal: string): Participant | null {
    const p = this.participants.get(connId);
    if (!p || p.principal !== callerPrincipal) return null;
    return p;
  }

  /**
   * Request input control. Granted only when control is FREE (no pre-emption — a controller is
   * never kicked). On success the caller becomes the holder. The `connId` must be a participant AND
   * belong to `callerPrincipal` (server-bound identity) — a cross-principal connId is denied.
   */
  requestControl(connId: string, callerPrincipal: string): ControlResult {
    if (!this.boundParticipant(connId, callerPrincipal)) {
      return { ok: false, reason: NOT_YOUR_PARTICIPANT };
    }
    if (this.controlHolder === connId) {
      // Already holding — idempotent success.
      return { ok: true, holder: connId };
    }
    if (this.controlHolder !== null) {
      return { ok: false, reason: `held_by:${this.controlHolder}` };
    }
    this.controlHolder = connId;
    return { ok: true, holder: connId };
  }

  /**
   * Hand control from the current holder to another participant. The caller must OWN `fromConnId`
   * (server-bound identity) AND `fromConnId` must be the current holder; the target must be an
   * attached participant (it may belong to ANY principal — e.g. handing a human's control to an
   * agent). On success control transfers to `toConnId`.
   */
  handoff(fromConnId: string, toConnId: string, callerPrincipal: string): ControlResult {
    if (!this.boundParticipant(fromConnId, callerPrincipal)) {
      return { ok: false, reason: NOT_YOUR_PARTICIPANT };
    }
    if (this.controlHolder !== fromConnId) {
      return { ok: false, reason: 'not_control_holder' };
    }
    if (!this.participants.has(toConnId)) {
      return { ok: false, reason: 'target_not_a_participant' };
    }
    this.controlHolder = toConnId;
    return { ok: true, holder: toConnId };
  }

  /**
   * Release input control. The `connId` must belong to `callerPrincipal`; only the current holder
   * actually frees control (releasing when you don't hold is a harmless no-op). A cross-principal
   * connId is denied — a client can't force-release another principal's control. Leaves control
   * FREE (never auto-promotes — an explicit release means "nobody is driving until someone asks").
   */
  releaseControl(connId: string, callerPrincipal: string): AuthorizeResult {
    if (!this.boundParticipant(connId, callerPrincipal)) {
      return { ok: false, denied: true, reason: NOT_YOUR_PARTICIPANT };
    }
    if (this.controlHolder === connId) this.controlHolder = null;
    return { ok: true };
  }

  /**
   * Authorize a tool invocation. The `connId` must belong to `callerPrincipal` (server-bound
   * identity — a cross-principal or absent connId is denied). MUTATING tools (click/type/key/
   * run_shell/open_app) further require the caller to be the control holder; READ-ONLY tools
   * (screenshot/list_windows/read_file) are allowed to any bound participant (a viewer may observe
   * but not drive).
   */
  authorizeTool(connId: string, toolName: McpToolName, callerPrincipal: string): AuthorizeResult {
    if (!this.boundParticipant(connId, callerPrincipal)) {
      return { ok: false, denied: true, reason: NOT_YOUR_PARTICIPANT };
    }
    if (!isMutatingTool(toolName)) return { ok: true };
    if (this.controlHolder !== connId) {
      return {
        ok: false,
        denied: true,
        reason:
          this.controlHolder === null
            ? `requires_control:free`
            : `requires_control:held_by:${this.controlHolder}`,
      };
    }
    return { ok: true };
  }

  /** The current control holder's `connId`, or `null` when control is free. */
  holder(): string | null {
    return this.controlHolder;
  }

  /** Point-in-time snapshot (roster in join order + current holder). Safe to persist/serialize. */
  snapshot(): SessionSnapshot {
    return {
      participants: [...this.participants.values()],
      controlHolder: this.controlHolder,
    };
  }
}
