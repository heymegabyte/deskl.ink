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

/**
 * Cloudflare Containers billing rates (Workers Paid), normalized to $/unit-HOUR.
 * SOURCE: Cloudflare Containers pricing — developers.cloudflare.com/containers/platform/pricing
 * (verified 2026-10): $0.0000025/GiB-s memory, $0.000020/vCPU-s CPU, $0.00000007/GB-s disk.
 *
 * Memory + disk accrue for the FULL allocation every second a container RUNS; CPU is billed only
 * for ACTIVE vCPU usage — so real cost sits in [baseline (mem+disk), baseline + full-CPU]. These
 * are PROVIDER (infrastructure) rates — not a customer price — and feed ESTIMATES, never a metered
 * or finalized invoice (that needs the usage ledger, M3). The monthly Workers-Paid included
 * allotments are ignored here (a per-computer estimate can't know account-wide usage).
 */
export const CF_CONTAINER_RATES = {
  memoryUsdPerGiBHour: 0.0000025 * 3600, // 0.009
  diskUsdPerGBHour: 0.00000007 * 3600, // 0.000252
  cpuUsdPerVcpuHour: 0.00002 * 3600, // 0.072 (full active)
  source: 'developers.cloudflare.com/containers/platform/pricing (2026-10)',
} as const;

/**
 * Estimated PROVIDER cost of a running desktop of the given size. `baselineUsdPerHour` = memory +
 * disk (accrues whenever it runs, regardless of activity); `maxUsdPerHour` = baseline + fully-active
 * CPU. Real cost lands in between. An ESTIMATE from the CF rate card × the size's allocation —
 * clearly not a finalized bill (see `CF_CONTAINER_RATES`).
 */
export function estimateDesktopCost(size: DesktopSizeId): {
  baselineUsdPerHour: number;
  maxUsdPerHour: number;
} {
  const s = DESKTOP_SIZES[size] ?? DESKTOP_SIZES.everyday;
  const baseline =
    s.ramGiB * CF_CONTAINER_RATES.memoryUsdPerGiBHour +
    s.diskGB * CF_CONTAINER_RATES.diskUsdPerGBHour;
  return { baselineUsdPerHour: baseline, maxUsdPerHour: baseline + s.vcpu * CF_CONTAINER_RATES.cpuUsdPerVcpuHour };
}

/**
 * Selectable Linux distributions (the OS picker). Ubuntu is the default. Each carries its
 * signature brand colors for the picker's gradient orb — ORIGINAL stylized marks rendered
 * from these colors, never reproductions of the distros' trademarked logos.
 */
export const DISTRO_IDS = ['ubuntu', 'fedora', 'debian'] as const;
export const DistroIdSchema = z.enum(DISTRO_IDS);
export type DistroId = z.infer<typeof DistroIdSchema>;

export interface DistroSpec {
  readonly id: DistroId;
  readonly name: string;
  readonly version: string;
  /** Display OS string, e.g. "Ubuntu 24.04". */
  readonly os: string;
  readonly tagline: string;
  /** Signature brand colors for the picker orb gradient. */
  readonly color: string;
  readonly color2: string;
}
export const DISTROS: Readonly<Record<DistroId, DistroSpec>> = {
  ubuntu: {
    id: 'ubuntu',
    name: 'Ubuntu',
    version: '24.04 LTS',
    os: 'Ubuntu 24.04',
    tagline: 'Rock-solid & familiar',
    color: '#E95420',
    color2: '#772953',
  },
  fedora: {
    id: 'fedora',
    name: 'Fedora',
    version: '41',
    os: 'Fedora 41',
    tagline: 'Cutting-edge & clean',
    color: '#3C6EB4',
    color2: '#51A2DA',
  },
  debian: {
    id: 'debian',
    name: 'Debian',
    version: '12',
    os: 'Debian 12',
    tagline: 'Stable & universal',
    color: '#D70A53',
    color2: '#A81D33',
  },
} as const;

/**
 * Computer form (spec §9): a graphical `desktop` (full GUI over VNC) or a headless `server`
 * (terminal / OpenCode / files / ports — NOT a desktop with VNC hidden). Behavior derives from
 * this + capabilities, not from platform-name conditionals.
 */
export const COMPUTER_FORMS = ['desktop', 'server'] as const;
export const ComputerFormSchema = z.enum(COMPUTER_FORMS);
export type ComputerForm = z.infer<typeof ComputerFormSchema>;

export interface ComputerFormSpec {
  readonly id: ComputerForm;
  readonly name: string;
  readonly tagline: string;
}
export const COMPUTER_FORM_SPECS: Readonly<Record<ComputerForm, ComputerFormSpec>> = {
  desktop: { id: 'desktop', name: 'Desktop', tagline: 'Full graphical workstation' },
  server: { id: 'server', name: 'Server', tagline: 'Headless — terminal, agents, OpenCode' },
} as const;

/** POST /api/v1/desktops — create a computer. */
export const CreateDesktopRequestSchema = z
  .object({
    name: z.string().min(1).max(60).optional(),
    size: DesktopSizeIdSchema.default('everyday'),
    distro: DistroIdSchema.default('ubuntu'),
    form: ComputerFormSchema.default('desktop'),
    disposable: z.boolean().default(false),
  })
  .strict();
export type CreateDesktopRequest = z.infer<typeof CreateDesktopRequestSchema>;

/**
 * PATCH /api/v1/desktops/:id — rename a computer (metadata only; allowed in any lifecycle state).
 * `name` is trimmed then length-checked, so an all-whitespace name is rejected (400).
 */
export const UpdateDesktopRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
  })
  .strict();
export type UpdateDesktopRequest = z.infer<typeof UpdateDesktopRequestSchema>;

/** A desktop as returned by the API. */
export const DesktopResourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  os: z.string(),
  distro: DistroIdSchema,
  size: DesktopSizeIdSchema,
  form: ComputerFormSchema.default('desktop'),
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
  distro: DistroIdSchema,
  // Carried so the VNC/terminal proxy routes to the right container namespace without re-reading
  // the registry. (distro × size × form) selects the Durable Object class. `form` defaults to
  // 'desktop' so any older ticket still parses.
  size: DesktopSizeIdSchema,
  form: ComputerFormSchema.default('desktop'),
  exp: z.number(), // epoch seconds
});
export type VncTicketClaims = z.infer<typeof VncTicketClaimsSchema>;

export const CreateDesktopResponseSchema = z.object({
  desktop: DesktopResourceSchema,
  /** opaque signed ticket the client appends to the VNC URL */
  vncTicket: z.string(),
});
export type CreateDesktopResponse = z.infer<typeof CreateDesktopResponseSchema>;

/**
 * Response of the mint-ticket endpoint. A VNC ticket is short-lived, so a client that opens a
 * desktop WITHOUT a create-time ticket (page reload, reopening a running desktop) mints a fresh
 * one on demand — otherwise the connect view would dead-end with no way to get a ticket.
 */
export const VncTicketResponseSchema = z.object({ vncTicket: z.string() });
export type VncTicketResponse = z.infer<typeof VncTicketResponseSchema>;

/** Container port websockify serves (noVNC HTML + ws proxy to local VNC) — see Dockerfile. */
export const VNC_CONTAINER_PORT = 6080;

/** Container port ttyd serves the browser terminal on (xterm.js HTML + ws) — see Dockerfile. */
export const TTYD_CONTAINER_PORT = 7681;

/**
 * API route builders — ONE definition imported by server, client, and E2E so paths can't drift.
 * `/vnc/*` proxies (HTTP + WebSocket) to the container's websockify on VNC_CONTAINER_PORT.
 */
export const desktopApi = {
  list: () => '/api/v1/desktops',
  create: () => '/api/v1/desktops',
  get: (id: string) => `/api/v1/desktops/${id}`,
  /** PATCH — rename a computer (metadata only). Same path as get/destroy; method distinguishes. */
  update: (id: string) => `/api/v1/desktops/${id}`,
  start: (id: string) => `/api/v1/desktops/${id}/start`,
  stop: (id: string) => `/api/v1/desktops/${id}/stop`,
  destroy: (id: string) => `/api/v1/desktops/${id}`,
  /** mint a fresh VNC ticket for a running desktop (self-heal when no create-time ticket). */
  ticket: (id: string) => `/api/v1/desktops/${id}/ticket`,
  /**
   * noVNC client entry (HTML served by websockify through the proxy). `reconnect=true` +
   * `reconnect_delay` make noVNC transparently re-establish the WebSocket after a dropped browser
   * connection (network blip, laptop sleep) WITHOUT stopping the computer (spec §110) — the
   * path-scoped cookie keeps the reconnect authenticated.
   */
  vncClient: (id: string, ticket: string) =>
    `/api/v1/desktops/${id}/vnc/vnc.html?ticket=${encodeURIComponent(ticket)}&path=${encodeURIComponent(
      `api/v1/desktops/${id}/vnc/websockify?ticket=${ticket}`
    )}&autoconnect=true&resize=remote&reconnect=true&reconnect_delay=2000`,
  /** prefix proxied (HTTP+WS) to the container; append noVNC asset path or `websockify`. */
  vncProxyPrefix: (id: string) => `/api/v1/desktops/${id}/vnc`,
  /**
   * ttyd browser-terminal client entry — served at the proxied root (trailing slash matters so
   * ttyd's relative `./token` + `./ws` resolve under the prefix). The `?ticket=` authenticates the
   * first HTML load; the route then sets a path-scoped cookie so token + ws authenticate too.
   */
  termClient: (id: string, ticket: string) =>
    `/api/v1/desktops/${id}/term/?ticket=${encodeURIComponent(ticket)}`,
  /** prefix proxied (HTTP+WS) to the container's ttyd terminal on TTYD_CONTAINER_PORT. */
  termProxyPrefix: (id: string) => `/api/v1/desktops/${id}/term`,
} as const;

/**
 * Stable UI testids — shared by the web app AND the golden-path E2E so the test targets
 * exactly what the UI renders. Changing a value here updates both sides at once.
 */
export const desktopTestIds = {
  newComputerButton: 'new-computer-button',
  distroOption: 'distro-option', // carries data-distro=<id>
  formOption: 'form-option', // carries data-form=<id> (desktop | server)
  sizeOption: 'size-option', // carries data-size=<id>
  createConfirm: 'create-computer-confirm',
  tile: 'desktop-tile', // carries data-desktop-id
  tileStatus: 'desktop-status',
  openButton: 'desktop-open',
  stopButton: 'desktop-stop',
  deleteButton: 'desktop-delete',
  deleteConfirm: 'desktop-delete-confirm',
  renameButton: 'desktop-rename', // pencil affordance on a tile → inline name edit
  renameInput: 'desktop-rename-input', // the inline rename text field
  statusAnnouncer: 'status-announcer', // sr-only aria-live region for lifecycle outcomes (WCAG 4.1.3)
  vncViewport: 'vnc-viewport', // wraps the noVNC canvas/iframe in the fullscreen route
  controlSurface: 'desktop-control-surface',
  exitFullscreen: 'desktop-exit-fullscreen',
  terminalToggle: 'desktop-terminal-toggle', // opens the in-session browser terminal
  terminalPanel: 'desktop-terminal-panel', // the docked ttyd iframe panel
  terminalClose: 'desktop-terminal-close',
  financialBar: 'financial-bar', // global running-count + estimated burn/spend
  financialBarRunning: 'financial-bar-running', // the "N running" count
  // Tab workspace (spec §33): every open computer is a tab; Home = the manager grid.
  tabStrip: 'tab-strip',
  tab: 'tab', // carries data-tab-id=<computer id>
  tabHome: 'tab-home',
  tabClose: 'tab-close', // per-tab close (does NOT stop/destroy)
  tabNew: 'tab-new',
  stopAll: 'stop-all', // "stop everything costing money" (spec §40)
  stopAllConfirm: 'stop-all-confirm',
  serverWorkspace: 'server-workspace', // headless server tab (terminal-native)
  serverTerminal: 'server-terminal', // the ttyd iframe in a server tab
  // Command palette (⌘K / Ctrl+K) — fast keyboard nav to any computer + quick actions (§87).
  commandPalette: 'command-palette',
  commandInput: 'command-input',
  commandOption: 'command-option', // carries data-command=<id>
} as const;
