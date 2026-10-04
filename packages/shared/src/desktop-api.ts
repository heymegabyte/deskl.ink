/**
 * deskl.ink Desktop control-plane contract — the SINGLE SOURCE OF TRUTH shared by
 * the API worker (server), the web app (client), and the E2E golden-path test.
 * Zod schemas + inferred types + route builders + UI testids. Never duplicate these shapes.
 */
import { z } from 'zod';

/** Lifecycle states a desktop moves through. */
export const DESKTOP_STATUSES = [
  'stopped',
  'restoring',
  'starting',
  'ready',
  'active',
  'stopping',
  'persisting',
  'failed',
] as const;
export const DesktopStatusSchema = z.enum(DESKTOP_STATUSES);
export type DesktopStatus = z.infer<typeof DesktopStatusSchema>;

/** Friendly size ids (never leak Cloudflare `instance_type` into ordinary UX). */
export const DESKTOP_SIZE_IDS = ['everyday', 'developer', 'power', 'heavy'] as const;
export const DesktopSizeIdSchema = z.enum(DESKTOP_SIZE_IDS);
export type DesktopSizeId = z.infer<typeof DesktopSizeIdSchema>;

/**
 * Friendly size -> real Cloudflare Container resources (verified via ADR-0001 research gate).
 * standard-1 = 1/2 vCPU · 4 GiB · 8 GB disk (deskl.ink "Everyday"); up to standard-4.
 */
export interface DesktopSizeSpec {
  readonly id: DesktopSizeId;
  readonly friendlyName: string;
  readonly ramGiB: number;
  readonly vcpu: number;
  readonly diskGB: number;
  /** Cloudflare Containers `instance_type` — advanced detail only, not surfaced in ordinary UX. */
  readonly instanceType: 'standard-1' | 'standard-2' | 'standard-3' | 'standard-4';
}
export const DESKTOP_SIZES: Readonly<Record<DesktopSizeId, DesktopSizeSpec>> = {
  everyday: {
    id: 'everyday',
    friendlyName: 'Everyday',
    ramGiB: 4,
    vcpu: 0.5,
    diskGB: 8,
    instanceType: 'standard-1',
  },
  developer: {
    id: 'developer',
    friendlyName: 'Developer',
    ramGiB: 6,
    vcpu: 1,
    diskGB: 12,
    instanceType: 'standard-2',
  },
  power: {
    id: 'power',
    friendlyName: 'Power',
    ramGiB: 8,
    vcpu: 2,
    diskGB: 16,
    instanceType: 'standard-3',
  },
  heavy: {
    id: 'heavy',
    friendlyName: 'Heavy',
    ramGiB: 12,
    vcpu: 4,
    diskGB: 20,
    instanceType: 'standard-4',
  },
} as const;

export const DEFAULT_DESKTOP_OS = 'Ubuntu 24.04';

/** POST /api/v1/desktops — create a computer. */
export const CreateDesktopRequestSchema = z
  .object({
    name: z.string().min(1).max(60).optional(),
    size: DesktopSizeIdSchema.default('everyday'),
    disposable: z.boolean().default(false),
  })
  .strict();
export type CreateDesktopRequest = z.infer<typeof CreateDesktopRequestSchema>;

/** A desktop as returned by the API. */
export const DesktopResourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  os: z.string(),
  size: DesktopSizeIdSchema,
  status: DesktopStatusSchema,
  createdAt: z.string(),
  lastActiveAt: z.string().optional(),
  persistent: z.boolean(),
});
export type DesktopResource = z.infer<typeof DesktopResourceSchema>;

export const DesktopResponseSchema = z.object({ desktop: DesktopResourceSchema });
export type DesktopResponse = z.infer<typeof DesktopResponseSchema>;

export const DesktopListResponseSchema = z.object({ desktops: z.array(DesktopResourceSchema) });
export type DesktopListResponse = z.infer<typeof DesktopListResponseSchema>;

/**
 * Short-lived scoped VNC connection ticket (claims). Minted on create/start, verified on the
 * /vnc proxy route. NEVER a shared/static VNC password; NEVER a public unauthenticated port.
 */
export const VncTicketClaimsSchema = z.object({
  desktopId: z.string(),
  exp: z.number(), // epoch seconds
});
export type VncTicketClaims = z.infer<typeof VncTicketClaimsSchema>;

export const CreateDesktopResponseSchema = z.object({
  desktop: DesktopResourceSchema,
  /** opaque signed ticket the client appends to the VNC URL */
  vncTicket: z.string(),
});
export type CreateDesktopResponse = z.infer<typeof CreateDesktopResponseSchema>;

/** Container port websockify serves (noVNC HTML + ws proxy to local VNC) — see Dockerfile. */
export const VNC_CONTAINER_PORT = 6080;

/**
 * API route builders — ONE definition imported by server, client, and E2E so paths can't drift.
 * `/vnc/*` proxies (HTTP + WebSocket) to the container's websockify on VNC_CONTAINER_PORT.
 */
export const desktopApi = {
  list: () => '/api/v1/desktops',
  create: () => '/api/v1/desktops',
  get: (id: string) => `/api/v1/desktops/${id}`,
  start: (id: string) => `/api/v1/desktops/${id}/start`,
  stop: (id: string) => `/api/v1/desktops/${id}/stop`,
  destroy: (id: string) => `/api/v1/desktops/${id}`,
  /** noVNC client entry (HTML served by websockify through the proxy). */
  vncClient: (id: string, ticket: string) =>
    `/api/v1/desktops/${id}/vnc/vnc.html?ticket=${encodeURIComponent(ticket)}&path=${encodeURIComponent(
      `api/v1/desktops/${id}/vnc/websockify?ticket=${ticket}`
    )}&autoconnect=true&resize=remote`,
  /** prefix proxied (HTTP+WS) to the container; append noVNC asset path or `websockify`. */
  vncProxyPrefix: (id: string) => `/api/v1/desktops/${id}/vnc`,
} as const;

/**
 * Stable UI testids — shared by the web app AND the golden-path E2E so the test targets
 * exactly what the UI renders. Changing a value here updates both sides at once.
 */
export const desktopTestIds = {
  newComputerButton: 'new-computer-button',
  createConfirm: 'create-computer-confirm',
  tile: 'desktop-tile', // carries data-desktop-id
  tileStatus: 'desktop-status',
  openButton: 'desktop-open',
  stopButton: 'desktop-stop',
  deleteButton: 'desktop-delete',
  deleteConfirm: 'desktop-delete-confirm',
  vncViewport: 'vnc-viewport', // wraps the noVNC canvas/iframe in the fullscreen route
  controlSurface: 'desktop-control-surface',
  exitFullscreen: 'desktop-exit-fullscreen',
} as const;
