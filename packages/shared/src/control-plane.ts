/**
 * deskl.ink AGENT CONTROL PLANE contract — the SINGLE SOURCE OF TRUTH for the per-desktop
 * session coordinator shared by the API worker (server), any MCP/agent client, and the web app.
 *
 * Three features converge on ONE coordinator (the per-desktop Durable Object as the single
 * session coordinator + input arbiter):
 *   1. desktop-as-MCP-tool-surface — an agent drives the workstation through typed tool calls.
 *   2. multiple simultaneous connections — many humans/agents attach to the same desktop at once.
 *   3. human ↔ AI control handoff — exactly one participant holds INPUT control at a time; the
 *      others are live viewers; control is explicitly requested / handed off / released.
 *
 * Zod schemas + inferred types only — NO Workers / DOM / Node deps, so this file is importable by
 * the worker, the pure arbiter (`workers/api/src/control/SessionCoordinatorState.ts`), a browser
 * client, and unit tests alike. Never duplicate these shapes; infer types with `z.infer`.
 *
 * The whole surface is FLAG-GATED OFF by default (`AGENT_CONTROL_PLANE`, mirrors `COMPUTER_DO`):
 * the contract can compile + ship while the live route stays 404 until the flag is flipped.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Participants + control messages
// ---------------------------------------------------------------------------

/** What kind of actor a connection is — a `human` operator/viewer or an AI `agent`. */
export const PARTICIPANT_KINDS = ['human', 'agent'] as const;
export const ParticipantKindSchema = z.enum(PARTICIPANT_KINDS);
export type ParticipantKind = z.infer<typeof ParticipantKindSchema>;

/**
 * A participant's control role: the single `controller` holds INPUT control (may drive mutating
 * tools); every other attendee is a `viewer` (live view + read-only tools). Exactly one controller
 * at a time is enforced by the arbiter, not by this type.
 */
export const PARTICIPANT_ROLES = ['controller', 'viewer'] as const;
export const ParticipantRoleSchema = z.enum(PARTICIPANT_ROLES);
export type ParticipantRole = z.infer<typeof ParticipantRoleSchema>;

/**
 * One live connection attached to a desktop. `connId` is the coordinator's per-connection key (one
 * physical connection = one participant); `principal` is the owning identity (the signed session
 * user id) — several connections can share a principal (same user in two tabs, or an agent fleet).
 */
export const ParticipantSchema = z
  .object({
    /** Per-connection id — the arbiter's key; unique per physical connection. */
    connId: z.string().min(1),
    /** Owning identity (signed session user id / agent principal). Not unique across connections. */
    principal: z.string().min(1),
    kind: ParticipantKindSchema,
    role: ParticipantRoleSchema,
    /** ISO-8601 timestamp the connection attached. */
    attachedAt: z.string(),
    /** Optional human-friendly label, e.g. "Claude (build agent)" or "Brian — laptop". */
    label: z.string().optional(),
  })
  .strict();
export type Participant = z.infer<typeof ParticipantSchema>;

/**
 * Control-plane message — a discriminated union on `type`. Client→coordinator intents
 * (`request-control`, `release-control`, `handoff`) and coordinator→client broadcasts
 * (`control-changed`, `participants`, `denied`) travel over the same channel so one schema
 * validates every frame in either direction.
 */
export const ControlMessageSchema = z.discriminatedUnion('type', [
  /** Client → coordinator: "give me input control" (granted only if control is free). */
  z.object({ type: z.literal('request-control') }).strict(),
  /** Client → coordinator: "I'm done driving" (only the current holder releases). */
  z.object({ type: z.literal('release-control') }).strict(),
  /** Client → coordinator: current holder hands control to another participant. */
  z.object({ type: z.literal('handoff'), toConnId: z.string().min(1) }).strict(),
  /** Coordinator → clients: control holder changed (or was cleared → `null`). */
  z.object({ type: z.literal('control-changed'), holder: z.string().nullable() }).strict(),
  /** Coordinator → clients: the current roster snapshot. */
  z.object({ type: z.literal('participants'), list: z.array(ParticipantSchema) }).strict(),
  /** Coordinator → client: an intent was refused (e.g. control held by someone else). */
  z.object({ type: z.literal('denied'), reason: z.string() }).strict(),
]);
export type ControlMessage = z.infer<typeof ControlMessageSchema>;

// ---------------------------------------------------------------------------
// MCP tool surface — the desktop exposed as a typed tool set for AI agents
// ---------------------------------------------------------------------------

/**
 * The names of the tools the desktop exposes over MCP. MUTATING tools (click/type/key/run_shell/
 * open_app) change workstation state and require INPUT control; READ-ONLY tools (screenshot/
 * list_windows/read_file) observe only and are allowed to any participant. The arbiter — not this
 * enum — enforces that split (see `MUTATING_MCP_TOOLS`).
 */
export const MCP_TOOL_NAMES = [
  'screenshot',
  'click',
  'type',
  'key',
  'run_shell',
  'read_file',
  'open_app',
  'list_windows',
] as const;
export const McpToolNameSchema = z.enum(MCP_TOOL_NAMES);
export type McpToolName = z.infer<typeof McpToolNameSchema>;

/**
 * Mutating tools — require the caller to hold input control. SINGLE SOURCE for the mutating/read-
 * only split, consumed by the arbiter's `authorizeTool` and by the static descriptor list, so the
 * two can never drift. `read_file` is intentionally read-only (observe the filesystem, no change).
 */
export const MUTATING_MCP_TOOLS = ['click', 'type', 'key', 'run_shell', 'open_app'] as const;
export type MutatingMcpTool = (typeof MUTATING_MCP_TOOLS)[number];

/** True when a tool mutates workstation state (and therefore requires input control). */
export function isMutatingTool(name: McpToolName): boolean {
  return (MUTATING_MCP_TOOLS as readonly string[]).includes(name);
}

// --- Per-tool argument schemas --------------------------------------------

/** Mouse button for a click; defaults to the left button. */
export const MouseButtonSchema = z.enum(['left', 'right', 'middle']).default('left');

/** `click` — press a mouse button at viewport pixel (x, y). */
export const ClickArgsSchema = z
  .object({ x: z.number(), y: z.number(), button: MouseButtonSchema.optional() })
  .strict();
export type ClickArgs = z.infer<typeof ClickArgsSchema>;

/** `type` — type a literal UTF-8 string at the current focus. */
export const TypeArgsSchema = z.object({ text: z.string() }).strict();
export type TypeArgs = z.infer<typeof TypeArgsSchema>;

/** `key` — send a key chord, e.g. "ctrl+c" / "Return" / "alt+Tab" (xdotool-style spelling). */
export const KeyArgsSchema = z.object({ keys: z.string().min(1) }).strict();
export type KeyArgs = z.infer<typeof KeyArgsSchema>;

/** `run_shell` — run a shell command inside the workstation. */
export const RunShellArgsSchema = z.object({ command: z.string().min(1) }).strict();
export type RunShellArgs = z.infer<typeof RunShellArgsSchema>;

/** `read_file` — read a file from the workstation filesystem (read-only). */
export const ReadFileArgsSchema = z.object({ path: z.string().min(1) }).strict();
export type ReadFileArgs = z.infer<typeof ReadFileArgsSchema>;

/** `open_app` — launch / focus an application by name, e.g. "firefox". */
export const OpenAppArgsSchema = z.object({ app: z.string().min(1) }).strict();
export type OpenAppArgs = z.infer<typeof OpenAppArgsSchema>;

/** `screenshot` — capture the current screen. No arguments. */
export const ScreenshotArgsSchema = z.object({}).strict();
export type ScreenshotArgs = z.infer<typeof ScreenshotArgsSchema>;

/** `list_windows` — enumerate open windows (title/geometry). No arguments. */
export const ListWindowsArgsSchema = z.object({}).strict();
export type ListWindowsArgs = z.infer<typeof ListWindowsArgsSchema>;

/**
 * Map of tool name → its argument schema. The MCP route validates `args` against the entry for the
 * requested tool, so a malformed call is rejected at the boundary (Zod-everywhere) before it ever
 * reaches the coordinator or the (future) container command daemon.
 */
export const MCP_TOOL_ARG_SCHEMAS = {
  screenshot: ScreenshotArgsSchema,
  click: ClickArgsSchema,
  type: TypeArgsSchema,
  key: KeyArgsSchema,
  run_shell: RunShellArgsSchema,
  read_file: ReadFileArgsSchema,
  open_app: OpenAppArgsSchema,
  list_windows: ListWindowsArgsSchema,
} as const satisfies Record<McpToolName, z.ZodTypeAny>;

/** A fully-formed MCP tool call: a tool name + its (unvalidated-here) argument object. */
export const McpToolCallSchema = z
  .object({ name: McpToolNameSchema, args: z.record(z.unknown()).default({}) })
  .strict();
export type McpToolCall = z.infer<typeof McpToolCallSchema>;

// --- Tool results ----------------------------------------------------------

/**
 * The result of invoking a tool — a discriminated union on success + failure KIND:
 *   - `{ ok: true, data }`                              — the tool ran; `data` is its payload.
 *   - `{ ok: false, kind: 'capability_gap', tool, reason }` — the capability isn't wired YET
 *       (e.g. the container command daemon isn't deployed). HONEST, not a fake success.
 *   - `{ ok: false, kind: 'denied', reason }`           — the caller isn't authorized (no control).
 *
 * `ok` is NOT the discriminant (both failures share `ok:false`); `kind` distinguishes the two
 * failures. Modeling a not-yet-built capability as a first-class result (never a thrown error or a
 * faked success) is a deskl.ink invariant.
 */
export const McpToolResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: z.unknown() }),
  z.object({
    ok: z.literal(false),
    kind: z.enum(['capability_gap', 'denied']),
    /** Present on a capability gap — which tool is not yet wired. */
    tool: McpToolNameSchema.optional(),
    reason: z.string(),
  }),
]);
export type McpToolResult = z.infer<typeof McpToolResultSchema>;

/**
 * Static, client-facing description of a tool (the `tools/list` payload): its name, a one-line
 * human description, and whether it mutates workstation state (so a client can grey out mutating
 * tools while it only holds a viewer role).
 */
export const McpToolDescriptorSchema = z
  .object({
    name: McpToolNameSchema,
    description: z.string(),
    mutating: z.boolean(),
  })
  .strict();
export type McpToolDescriptor = z.infer<typeof McpToolDescriptorSchema>;

/**
 * The canonical tool catalog returned by `tools/list`. One entry per `McpToolName`; `mutating` is
 * derived from `MUTATING_MCP_TOOLS` so the flag can never drift from the arbiter's authorization.
 */
export const MCP_TOOL_DESCRIPTORS: readonly McpToolDescriptor[] = [
  { name: 'screenshot', description: 'Capture the current desktop screen as an image.', mutating: false },
  { name: 'list_windows', description: 'List open windows (title + geometry).', mutating: false },
  { name: 'read_file', description: 'Read a file from the workstation filesystem.', mutating: false },
  { name: 'click', description: 'Click a mouse button at a screen coordinate.', mutating: true },
  { name: 'type', description: 'Type a literal string at the current focus.', mutating: true },
  { name: 'key', description: 'Send a keyboard chord (e.g. ctrl+c, Return).', mutating: true },
  { name: 'run_shell', description: 'Run a shell command inside the workstation.', mutating: true },
  { name: 'open_app', description: 'Launch or focus an application by name.', mutating: true },
] as const;

// ---------------------------------------------------------------------------
// Coordinator snapshot — the authoritative per-desktop session state
// ---------------------------------------------------------------------------

/**
 * Point-in-time view of a desktop's session: who is attached + who (if anyone) holds input control.
 * `controlHolder` is a `connId` from `participants`, or `null` when control is free. The pure
 * arbiter returns this shape and the DO persists it.
 */
export const SessionSnapshotSchema = z
  .object({
    participants: z.array(ParticipantSchema),
    controlHolder: z.string().nullable(),
  })
  .strict();
export type SessionSnapshot = z.infer<typeof SessionSnapshotSchema>;
