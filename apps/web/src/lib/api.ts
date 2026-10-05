/**
 * Tiny typed fetch client for the deskl.ink desktop control-plane.
 *
 * Every method hits a `desktopApi` route builder (the shared SSOT so paths can't
 * drift), parses the response body with the matching Zod schema, and throws a
 * typed {@link ApiError} on any non-2xx / malformed-shape / network failure.
 *
 * Base URL is `import.meta.env.VITE_API_BASE ?? ''` — empty means same-origin
 * (the production default, where the Worker serves both the app and the API).
 */
// The desktop control-plane contract lives in @deskl/shared's `desktop-api`
// module. The package barrel (`index.ts`) does not re-export it, so we reach it
// by its source path — the same `packages/shared/src` the web app already
// resolves against. This keeps the SSOT (one definition, imported here) without
// duplicating any shape and without touching the shared package or build config.
import {
  desktopApi,
  CreateDesktopRequestSchema,
  CreateDesktopResponseSchema,
  DesktopListResponseSchema,
  DesktopResponseSchema,
  VncTicketResponseSchema,
  type CreateDesktopRequest,
  type CreateDesktopResponse,
  type DesktopListResponse,
  type DesktopResource,
} from '../../../../packages/shared/src/desktop-api';
import type { z } from 'zod';

/** Same-origin in prod; override with `VITE_API_BASE` for split-origin dev. */
const API_BASE: string = import.meta.env.VITE_API_BASE ?? '';

/**
 * Typed error for every control-plane failure. `kind` lets callers branch:
 * - `network` — fetch rejected (offline, DNS, CORS preflight)
 * - `http` — a non-2xx response (carries `status` + any server message)
 * - `parse` — a 2xx response whose body failed Zod validation (contract drift)
 */
export class ApiError extends Error {
  readonly kind: 'network' | 'http' | 'parse';
  readonly status: number | undefined;

  constructor(kind: ApiError['kind'], message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}

/** Shape some APIs use to carry a human-readable error on a non-2xx body. */
interface ServerErrorBody {
  error?: string;
  message?: string;
}

/** Pull a best-effort human message out of an error response body. */
function errorMessageFrom(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const b = body as ServerErrorBody;
    if (typeof b.error === 'string' && b.error) return b.error;
    if (typeof b.message === 'string' && b.message) return b.message;
  }
  return fallback;
}

/**
 * Core request helper: fetch → status check → JSON parse → Zod validate.
 * Returns the parsed, typed body. Throws {@link ApiError} on any failure.
 */
interface RequestOptions {
  method?: string | undefined;
  body?: string | undefined;
  signal?: AbortSignal | undefined;
}

async function request<TSchema extends z.ZodTypeAny>(
  path: string,
  schema: TSchema,
  opts: RequestOptions = {}
): Promise<z.infer<TSchema>> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: opts.method ?? 'GET',
      credentials: 'include',
      // Coerce the optional AbortSignal to `null` so it satisfies RequestInit
      // under `exactOptionalPropertyTypes` (DOM types `signal` as `… | null`).
      signal: opts.signal ?? null,
      ...(opts.body !== undefined ? { body: opts.body } : {}),
      headers: {
        Accept: 'application/json',
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch (cause) {
    throw new ApiError(
      'network',
      cause instanceof Error ? cause.message : 'Network request failed'
    );
  }

  // Read the body once; tolerate empty/non-JSON bodies without crashing.
  const raw = await res.text();
  let json: unknown;
  try {
    json = raw ? JSON.parse(raw) : undefined;
  } catch {
    json = undefined;
  }

  if (!res.ok) {
    throw new ApiError(
      'http',
      errorMessageFrom(json, `Request failed with status ${res.status}`),
      res.status
    );
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError(
      'parse',
      `Unexpected response shape for ${path}: ${parsed.error.issues
        .map((i) => `${i.path.join('.') || '(root)'} ${i.message}`)
        .join('; ')}`
    );
  }
  return parsed.data;
}

/**
 * The typed desktop control-plane client. One method per route; each validates
 * its response against the shared Zod schema and returns a typed domain object.
 */
export const api = {
  /** GET /api/v1/desktops — every desktop owned by the caller. */
  async listDesktops(signal?: AbortSignal): Promise<DesktopListResponse> {
    return request(desktopApi.list(), DesktopListResponseSchema, { signal });
  },

  /** POST /api/v1/desktops — provision a computer; returns the desktop + VNC ticket. */
  async createDesktop(
    body: CreateDesktopRequest,
    signal?: AbortSignal
  ): Promise<CreateDesktopResponse> {
    // Validate our own request against the contract before it leaves the client.
    const payload = CreateDesktopRequestSchema.parse(body);
    return request(desktopApi.create(), CreateDesktopResponseSchema, {
      method: 'POST',
      body: JSON.stringify(payload),
      signal,
    });
  },

  /** GET /api/v1/desktops/:id — poll a single desktop's current state. */
  async getDesktop(id: string, signal?: AbortSignal): Promise<DesktopResource> {
    const { desktop } = await request(desktopApi.get(id), DesktopResponseSchema, { signal });
    return desktop;
  },

  /** POST /api/v1/desktops/:id/start — boot a stopped desktop. */
  async startDesktop(id: string, signal?: AbortSignal): Promise<DesktopResource> {
    const { desktop } = await request(desktopApi.start(id), DesktopResponseSchema, {
      method: 'POST',
      signal,
    });
    return desktop;
  },

  /**
   * POST /api/v1/desktops/:id/ticket — mint a fresh VNC ticket for a running desktop.
   * Used when opening a desktop without a create-time ticket (reload, reopen) so the
   * fullscreen view can always obtain a connection instead of dead-ending on a spinner.
   */
  async mintTicket(id: string, signal?: AbortSignal): Promise<string> {
    const { vncTicket } = await request(desktopApi.ticket(id), VncTicketResponseSchema, {
      method: 'POST',
      signal,
    });
    return vncTicket;
  },

  /** POST /api/v1/desktops/:id/stop — persist + power down a running desktop. */
  async stopDesktop(id: string, signal?: AbortSignal): Promise<DesktopResource> {
    const { desktop } = await request(desktopApi.stop(id), DesktopResponseSchema, {
      method: 'POST',
      signal,
    });
    return desktop;
  },

  /** DELETE /api/v1/desktops/:id — destroy a desktop and its persisted volume. */
  async deleteDesktop(id: string, signal?: AbortSignal): Promise<void> {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}${desktopApi.destroy(id)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { Accept: 'application/json' },
        signal: signal ?? null,
      });
    } catch (cause) {
      throw new ApiError(
        'network',
        cause instanceof Error ? cause.message : 'Network request failed'
      );
    }
    if (!res.ok) {
      const raw = await res.text();
      let json: unknown;
      try {
        json = raw ? JSON.parse(raw) : undefined;
      } catch {
        json = undefined;
      }
      throw new ApiError(
        'http',
        errorMessageFrom(json, `Delete failed (${res.status})`),
        res.status
      );
    }
  },
} as const;

export type DesktopApiClient = typeof api;
