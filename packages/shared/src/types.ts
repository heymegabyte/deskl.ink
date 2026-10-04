/**
 * deskl.ink core domain types.
 *
 * Minimal but real — the shapes the whole product is built around.
 *
 * SOURCE-OF-TRUTH NOTE: the desktop LIFECYCLE + SIZE catalog (`DesktopStatus`,
 * `DesktopSizeId`, size specs, `DESKTOP_SIZES`) live in `./desktop-api.ts` as
 * Zod schemas — that is the single source of truth shared by the Worker, web
 * app, and E2E. They are imported here only to type the domain shapes below;
 * the barrel (`index.ts`) publicly re-exports them from `./desktop-api.js`, so
 * nothing is duplicated (per house `zod-everywhere` doctrine).
 */

import type { DesktopStatus, DesktopSizeId } from './desktop-api.js';

/** Who or what owns the active control of a desktop at a moment in time. */
export type DesktopOperator = 'human' | 'agent';

/**
 * A desktop instance owned by a user. The persisted home volume lives in R2;
 * the live compute is a Container fronted by a Durable Object.
 */
export interface Desktop {
  readonly id: string;
  readonly ownerId: string;
  /** Human-chosen label, e.g. "Design box". */
  name: string;
  size: DesktopSizeId;
  status: DesktopStatus;
  /** ISO-8601 creation timestamp. */
  readonly createdAt: string;
  /** ISO-8601 of the most recent status transition. */
  updatedAt: string;
  /** ISO-8601 of the last time a human or agent interacted. */
  lastActiveAt?: string;
  /** Opaque R2 key for the latest persisted home-volume snapshot. */
  snapshotKey?: string;
}

/**
 * A live connection to a desktop. A desktop can host both a human viewer and
 * an AI agent operator concurrently; each attaches as a session.
 */
export interface Session {
  readonly id: string;
  readonly desktopId: string;
  operator: DesktopOperator;
  /** ISO-8601 when the session connected. */
  readonly startedAt: string;
  /** ISO-8601 when the session ended; absent while live. */
  endedAt?: string;
  /** Round-trip latency in ms from the last heartbeat, if measured. */
  latencyMs?: number;
}

/** Billable / analytics event emitted as desktops run. */
export type UsageEventKind =
  | 'desktop.created'
  | 'desktop.started'
  | 'desktop.stopped'
  | 'session.attached'
  | 'session.detached'
  | 'compute.minute';

/** A single usage/metering event. */
export interface UsageEvent {
  readonly id: string;
  readonly desktopId: string;
  readonly ownerId: string;
  readonly kind: UsageEventKind;
  /** ISO-8601 event timestamp. */
  readonly at: string;
  /** Metered quantity (e.g. minutes for `compute.minute`); 1 for discrete events. */
  readonly quantity: number;
}
