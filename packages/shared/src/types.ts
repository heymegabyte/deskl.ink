/**
 * deskl.ink core domain types.
 *
 * Minimal but real — the shapes the whole product is built around. These are
 * plain TypeScript types for Milestone 1; Zod schemas that validate them at
 * runtime boundaries land in Milestone 2 (per house `zod-everywhere` doctrine,
 * the Zod schema will become the source of truth and these will be inferred).
 */

/**
 * Lifecycle of a desktop (a containerized Linux workstation backed by a
 * Durable Object + Cloudflare Container). Ordering reflects the natural flow:
 * stopped → restoring (pulling persisted state) → starting (boot) → ready →
 * active (in use) → stopping → persisting (snapshot to R2) → stopped.
 */
export type DesktopStatus =
  'stopped' | 'restoring' | 'starting' | 'ready' | 'active' | 'stopping' | 'persisting' | 'failed';

/** Catalog key for a desktop size tier. */
export type DesktopSizeId = 'everyday' | 'developer' | 'power' | 'heavy';

/** A selectable desktop size with its friendly name and RAM allocation. */
export interface DesktopSize {
  readonly id: DesktopSizeId;
  readonly friendlyName: string;
  readonly ramGiB: number;
  /** Virtual CPU cores allocated to the container. */
  readonly vcpu: number;
  /** One-line human description surfaced in the picker. */
  readonly description: string;
}

/** The canonical size catalog. Source of truth for the picker + billing. */
export const DESKTOP_SIZES: Readonly<Record<DesktopSizeId, DesktopSize>> = {
  everyday: {
    id: 'everyday',
    friendlyName: 'Everyday',
    ramGiB: 2,
    vcpu: 1,
    description: 'Browsing, writing, light tools.',
  },
  developer: {
    id: 'developer',
    friendlyName: 'Developer',
    ramGiB: 4,
    vcpu: 2,
    description: 'Editors, build tools, containers.',
  },
  power: {
    id: 'power',
    friendlyName: 'Power',
    ramGiB: 8,
    vcpu: 4,
    description: 'Heavy IDEs, parallel workloads.',
  },
  heavy: {
    id: 'heavy',
    friendlyName: 'Heavy',
    ramGiB: 16,
    vcpu: 8,
    description: 'Data, simulation, large builds.',
  },
} as const;

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
