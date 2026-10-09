/**
 * Unit tests for the agent control plane's PURE core: the `SessionCoordinatorState` arbiter and the
 * shared Zod contracts. No Workers runtime — just the rules + the schemas (the Durable Object merely
 * persists this state, so proving the rules here proves the behavior the DO exposes over RPC).
 *
 * Covers the three converged features:
 *   1. desktop-as-MCP tool authorization (mutating needs control; read-only open to any participant),
 *   2. multiple simultaneous connections (a second participant joins), and
 *   3. human↔AI control handoff (request when free, handoff, release, auto-promote on leave).
 */
import { describe, it, expect } from 'vitest';
import {
  ControlMessageSchema,
  McpToolCallSchema,
  McpToolResultSchema,
  ParticipantSchema,
  type Participant,
} from '@deskl/shared';
import { SessionCoordinatorState } from '../src/control/SessionCoordinatorState.js';

/** Build a participant with sane defaults; override per test. */
function participant(over: Partial<Participant> & { connId: string }): Participant {
  return {
    principal: `user-${over.connId}`,
    kind: 'human',
    role: 'viewer',
    attachedAt: '2026-10-09T00:00:00.000Z',
    ...over,
  };
}

describe('SessionCoordinatorState — participants + multi-connection', () => {
  it('join adds a participant to the roster', () => {
    const s = new SessionCoordinatorState();
    const snap = s.join(participant({ connId: 'c1', kind: 'human', role: 'controller' }));
    expect(snap.participants).toHaveLength(1);
    expect(snap.participants[0]?.connId).toBe('c1');
  });

  it('a first controller takes control on join; a free session has no holder for a viewer', () => {
    const controller = new SessionCoordinatorState();
    controller.join(participant({ connId: 'c1', role: 'controller' }));
    expect(controller.holder()).toBe('c1');

    const viewerOnly = new SessionCoordinatorState();
    viewerOnly.join(participant({ connId: 'v1', role: 'viewer' }));
    expect(viewerOnly.holder()).toBeNull();
  });

  it('supports multiple simultaneous connections (a second participant joins)', () => {
    const s = new SessionCoordinatorState();
    s.join(participant({ connId: 'human-1', kind: 'human', role: 'controller' }));
    const snap = s.join(participant({ connId: 'agent-1', kind: 'agent', role: 'viewer' }));
    expect(snap.participants).toHaveLength(2);
    expect(snap.participants.map((p) => p.connId)).toEqual(['human-1', 'agent-1']);
    // The first controller still holds control; the second connection is a live viewer.
    expect(snap.controlHolder).toBe('human-1');
  });
});

describe('SessionCoordinatorState — control handoff', () => {
  it('requestControl when control is free → grants', () => {
    const s = new SessionCoordinatorState();
    s.join(participant({ connId: 'v1', role: 'viewer' })); // nobody holds control
    expect(s.holder()).toBeNull();
    const res = s.requestControl('v1', 'user-v1');
    expect(res).toEqual({ ok: true, holder: 'v1' });
    expect(s.holder()).toBe('v1');
  });

  it('requestControl when held → denied with held_by reason', () => {
    const s = new SessionCoordinatorState();
    s.join(participant({ connId: 'c1', role: 'controller' }));
    s.join(participant({ connId: 'c2', role: 'viewer' }));
    const res = s.requestControl('c2', 'user-c2');
    expect(res).toEqual({ ok: false, reason: 'held_by:c1' });
    expect(s.holder()).toBe('c1');
  });

  it('requestControl by the CURRENT holder is idempotent ok', () => {
    const s = new SessionCoordinatorState();
    s.join(participant({ connId: 'c1', role: 'controller' })); // takes control on join
    expect(s.holder()).toBe('c1');
    // The holder re-requesting its own control is a no-op success (not a `held_by:self` denial).
    expect(s.requestControl('c1', 'user-c1')).toEqual({ ok: true, holder: 'c1' });
    expect(s.holder()).toBe('c1');
  });

  it('handoff transfers the holder (only the holder may hand off, to a participant)', () => {
    const s = new SessionCoordinatorState();
    s.join(participant({ connId: 'human-1', kind: 'human', role: 'controller' }));
    s.join(participant({ connId: 'agent-1', kind: 'agent', role: 'viewer' }));
    expect(s.holder()).toBe('human-1');

    const ok = s.handoff('human-1', 'agent-1', 'user-human-1');
    expect(ok).toEqual({ ok: true, holder: 'agent-1' });
    expect(s.holder()).toBe('agent-1');

    // A non-holder can't hand off (agent-1 holds now; human-1 is no longer holder).
    expect(s.handoff('human-1', 'agent-1', 'user-human-1').ok).toBe(false);
    // An unknown target is rejected (agent-1 is the holder and owns its connId).
    expect(s.handoff('agent-1', 'ghost', 'user-agent-1').ok).toBe(false);
  });

  it('handoff by a NON-HOLDER participant is denied', () => {
    const s = new SessionCoordinatorState();
    s.join(participant({ connId: 'c1', role: 'controller' })); // holds control
    s.join(participant({ connId: 'c2', role: 'viewer' })); // a legitimate participant, not holder
    expect(s.holder()).toBe('c1');
    // c2 owns its own connId (principal matches) but does NOT hold control → not_control_holder.
    const res = s.handoff('c2', 'c1', 'user-c2');
    expect(res).toEqual({ ok: false, reason: 'not_control_holder' });
    expect(s.holder()).toBe('c1'); // unchanged
  });

  it('releaseControl frees control only for the holder; leave auto-promotes next controller', () => {
    const s = new SessionCoordinatorState();
    s.join(participant({ connId: 'c1', role: 'controller' }));
    s.join(participant({ connId: 'c2', role: 'controller' }));
    expect(s.holder()).toBe('c1');

    // A non-holder releasing is a harmless (authorized) no-op — c2 owns its connId.
    expect(s.releaseControl('c2', 'user-c2')).toEqual({ ok: true });
    expect(s.holder()).toBe('c1');
    // The holder releasing frees control (no auto-promote on explicit release).
    expect(s.releaseControl('c1', 'user-c1')).toEqual({ ok: true });
    expect(s.holder()).toBeNull();

    // Re-grant then prove leave() auto-promotes the next controller.
    s.requestControl('c1', 'user-c1');
    expect(s.holder()).toBe('c1');
    s.leave('c1');
    expect(s.holder()).toBe('c2');
  });

  it('holder leaving a room of ONLY viewers clears control (does NOT promote a viewer)', () => {
    const s = new SessionCoordinatorState();
    s.join(participant({ connId: 'c1', role: 'controller' })); // holds control
    s.join(participant({ connId: 'v1', role: 'viewer' }));
    s.join(participant({ connId: 'v2', role: 'viewer' }));
    expect(s.holder()).toBe('c1');

    // The holder leaves; the only remaining participants are viewers → auto-promote must find no
    // eligible controller and leave control FREE (never hand a viewer input control).
    const snap = s.leave('c1');
    expect(s.holder()).toBeNull();
    expect(snap.controlHolder).toBeNull();
    expect(snap.participants.map((p) => p.connId)).toEqual(['v1', 'v2']);
  });
});

describe('SessionCoordinatorState — tool authorization (desktop-as-MCP)', () => {
  it('a viewer / non-holder invoking a mutating tool (click) is denied', () => {
    const s = new SessionCoordinatorState();
    s.join(participant({ connId: 'c1', role: 'controller' })); // holds control
    s.join(participant({ connId: 'viewer-1', role: 'viewer' }));
    // viewer-1 owns its connId (principal matches) but doesn't hold control → requires_control.
    const verdict = s.authorizeTool('viewer-1', 'click', 'user-viewer-1');
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.denied).toBe(true);
      expect(verdict.reason).toBe('requires_control:held_by:c1');
    }
  });

  it('the control holder may invoke a mutating tool', () => {
    const s = new SessionCoordinatorState();
    s.join(participant({ connId: 'c1', role: 'controller' }));
    expect(s.authorizeTool('c1', 'type', 'user-c1')).toEqual({ ok: true });
  });

  it('the holder invoking a NON-mutating tool (screenshot) is ok', () => {
    const s = new SessionCoordinatorState();
    s.join(participant({ connId: 'c1', role: 'controller' })); // holds control
    // A read-only tool is allowed to the holder too (not only to viewers).
    expect(s.authorizeTool('c1', 'screenshot', 'user-c1')).toEqual({ ok: true });
  });

  it('a read-only tool (screenshot) is allowed for a viewer', () => {
    const s = new SessionCoordinatorState();
    s.join(participant({ connId: 'c1', role: 'controller' }));
    const viewer = participant({ connId: 'viewer-1', role: 'viewer' });
    s.join(viewer);
    expect(s.authorizeTool('viewer-1', 'screenshot', 'user-viewer-1')).toEqual({ ok: true });
    expect(s.authorizeTool('viewer-1', 'list_windows', 'user-viewer-1')).toEqual({ ok: true });
    expect(s.authorizeTool('viewer-1', 'read_file', 'user-viewer-1')).toEqual({ ok: true });
  });

  it('a non-participant is denied every tool (even read-only)', () => {
    const s = new SessionCoordinatorState();
    s.join(participant({ connId: 'c1', role: 'controller' }));
    expect(s.authorizeTool('stranger', 'screenshot', 'user-stranger').ok).toBe(false);
    expect(s.authorizeTool('stranger', 'click', 'user-stranger').ok).toBe(false);
  });

  it('a scoped op whose principal does NOT match the connId holder is denied (principal binding)', () => {
    const s = new SessionCoordinatorState();
    // c1 is a real participant owned by user-c1 and holds control.
    s.join(participant({ connId: 'c1', principal: 'user-c1', role: 'controller' }));
    // An ATTACKER authenticated as a different principal presents c1's opaque connId. The connId
    // exists, but its participant.principal !== the caller's principal → not_your_participant.
    const stolen = s.authorizeTool('c1', 'screenshot', 'attacker');
    expect(stolen).toEqual({ ok: false, denied: true, reason: 'not_your_participant' });
    // Same cross-principal rejection across every scoped surface (request / handoff / release).
    expect(s.requestControl('c1', 'attacker')).toEqual({
      ok: false,
      reason: 'not_your_participant',
    });
    expect(s.handoff('c1', 'c1', 'attacker')).toEqual({
      ok: false,
      reason: 'not_your_participant',
    });
    expect(s.releaseControl('c1', 'attacker')).toEqual({
      ok: false,
      denied: true,
      reason: 'not_your_participant',
    });
    // The real owner is unaffected: control never moved.
    expect(s.holder()).toBe('c1');
  });
});

describe('SessionCoordinatorState — snapshot round-trips through persistence', () => {
  it('fromSnapshot rehydrates roster + holder', () => {
    const s = new SessionCoordinatorState();
    s.join(participant({ connId: 'c1', role: 'controller' }));
    s.join(participant({ connId: 'c2', role: 'viewer' }));
    const persisted = s.snapshot();

    const restored = SessionCoordinatorState.fromSnapshot(persisted);
    expect(restored.snapshot()).toEqual(persisted);
    expect(restored.holder()).toBe('c1');
    // The restored arbiter enforces the same rules (c2 owns its connId but isn't the holder).
    expect(restored.authorizeTool('c2', 'click', 'user-c2').ok).toBe(false);
  });

  it('fromSnapshot drops a stale holder that is no longer a participant', () => {
    const restored = SessionCoordinatorState.fromSnapshot({
      participants: [participant({ connId: 'c2', role: 'viewer' })],
      controlHolder: 'ghost',
    });
    expect(restored.holder()).toBeNull();
  });
});

describe('shared control-plane contracts — validate + reject', () => {
  it('ParticipantSchema accepts a well-formed participant and rejects bad input', () => {
    const good = ParticipantSchema.safeParse({
      connId: 'c1',
      principal: 'user-1',
      kind: 'agent',
      role: 'controller',
      attachedAt: '2026-10-09T00:00:00.000Z',
      label: 'Claude',
    });
    expect(good.success).toBe(true);

    // Bad kind + empty connId + unknown extra key (schema is .strict()).
    expect(ParticipantSchema.safeParse({ connId: '', principal: 'u', kind: 'robot', role: 'controller', attachedAt: 'x' }).success).toBe(false);
    expect(ParticipantSchema.safeParse({ connId: 'c1', principal: 'u', kind: 'human', role: 'viewer', attachedAt: 'x', bogus: 1 }).success).toBe(false);
  });

  it('McpToolResultSchema validates each variant and rejects a malformed result', () => {
    expect(McpToolResultSchema.safeParse({ ok: true, data: { shot: 'png' } }).success).toBe(true);
    expect(
      McpToolResultSchema.safeParse({ ok: false, kind: 'denied', reason: 'no control' }).success
    ).toBe(true);
    expect(
      McpToolResultSchema.safeParse({
        ok: false,
        kind: 'capability_gap',
        tool: 'run_shell',
        reason: 'daemon not deployed',
      }).success
    ).toBe(true);

    // ok:false requires a `kind`; an unknown kind is rejected.
    expect(McpToolResultSchema.safeParse({ ok: false, reason: 'x' }).success).toBe(false);
    expect(McpToolResultSchema.safeParse({ ok: false, kind: 'explode', reason: 'x' }).success).toBe(false);
  });

  it('ControlMessageSchema parses a request-control and a handoff frame; rejects an unknown type', () => {
    expect(ControlMessageSchema.safeParse({ type: 'request-control' }).success).toBe(true);
    const handoff = ControlMessageSchema.safeParse({ type: 'handoff', toConnId: 'agent-1' });
    expect(handoff.success).toBe(true);
    const changed = ControlMessageSchema.safeParse({ type: 'control-changed', holder: null });
    expect(changed.success).toBe(true);

    expect(ControlMessageSchema.safeParse({ type: 'handoff' }).success).toBe(false); // missing toConnId
    expect(ControlMessageSchema.safeParse({ type: 'nope' }).success).toBe(false);
  });

  it('McpToolCallSchema parses a tool call and defaults empty args', () => {
    const parsed = McpToolCallSchema.safeParse({ name: 'click', args: { x: 10, y: 20 } });
    expect(parsed.success).toBe(true);
    const defaulted = McpToolCallSchema.parse({ name: 'screenshot' });
    expect(defaulted.args).toEqual({});
    expect(McpToolCallSchema.safeParse({ name: 'teleport' }).success).toBe(false);
  });
});
