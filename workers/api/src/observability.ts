/**
 * Observability — request correlation + structured logging for the control plane.
 *
 * Every control-plane request gets a stable correlation id (`x-request-id`): an inbound one is
 * honored (so a caller/edge can thread a trace through), else a fresh UUID is minted. The id is
 * stashed in the Hono context (handlers can read it) AND echoed on the response so a client can
 * tie its request to our logs. After the request completes, ONE structured JSON line is emitted
 * — method, path, status, duration, cf-ray, owner, desktop — the shape a log pipeline (and, once
 * its DSN lands, Sentry) can index. Closes the `drift-detection` "logs without correlation IDs" gap
 * and is the foundation the @sentry/cloudflare baseline will enrich later.
 *
 * Safety: this wraps EVERY Worker request, including the noVNC `/vnc/*` + ttyd `/term/*` WebSocket
 * tunnels. A header mutation on a `101 Switching Protocols` upgrade would break the socket, and a
 * long-lived tunnel shouldn't emit a per-request line — so for proxy paths we mint the id (for any
 * handler that wants it) but never touch the response or log. Logging itself is wrapped so a logging
 * failure can never affect a response.
 */

import type { Context, MiddlewareHandler } from 'hono';
import type { Env } from './env.js';

/** Context Variables the control plane threads through a request. */
export type AppVariables = {
  /** Correlation id for this request (inbound `x-request-id` or a minted UUID). */
  requestId: string;
  /** Owning principal id, set by `principalOf` once resolved (for log correlation). */
  ownerId?: string;
};

/** The Hono generic every control-plane app/handler uses. */
export type AppContext = { Bindings: Env; Variables: AppVariables };

/** One structured request log line. */
interface RequestLog {
  ts: string;
  level: 'info' | 'warn' | 'error';
  msg: 'request';
  requestId: string;
  // `| undefined` (not just `?`) so these can be set from optional sources under
  // exactOptionalPropertyTypes; JSON.stringify drops the undefined ones from the line.
  ray?: string | undefined;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  owner?: string | undefined;
  desktop?: string | undefined;
  environment?: string | undefined;
}

/** noVNC / ttyd tunnel sub-paths — never mutate or per-request-log these (WS upgrades). */
const PROXY_PATH = /\/(vnc|term)(\/|$)/;

/** Honor a sane inbound correlation id (bounded + safe charset) else mint a fresh UUID. */
function resolveRequestId(c: Context<AppContext>): string {
  const inbound = c.req.header('x-request-id');
  if (inbound && inbound.length <= 128 && /^[A-Za-z0-9._-]+$/.test(inbound)) return inbound;
  return crypto.randomUUID();
}

/** Pull a desktop id out of `/api/v1/desktops/:id[/...]` for log correlation. */
function desktopIdFromPath(path: string): string | undefined {
  return path.match(/\/api\/v1\/desktops\/([^/]+)/)?.[1];
}

/**
 * Request-logging middleware: mint/propagate the correlation id, time the request, and emit one
 * structured line per non-proxy control-plane request. Mount FIRST so it wraps everything.
 */
export function requestLogger(): MiddlewareHandler<AppContext> {
  return async (c, next) => {
    const start = Date.now();
    const requestId = resolveRequestId(c);
    c.set('requestId', requestId);

    await next();

    const path = new URL(c.req.url).pathname;
    // WS tunnels: leave the response untouched + don't per-request-log a long-lived socket.
    if (PROXY_PATH.test(path)) return;

    // Echo the correlation id so a client can tie its call to our logs. Guard: a response may be
    // immutable (e.g. an upgrade) — never let this throw.
    try {
      c.res.headers.set('x-request-id', requestId);
    } catch {
      /* immutable response — skip the header */
    }

    // Structured line. Wrapped so a logging failure can never affect the response.
    try {
      const status = c.res.status;
      const line: RequestLog = {
        ts: new Date().toISOString(),
        level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
        msg: 'request',
        requestId,
        ray: c.req.header('cf-ray') ?? undefined,
        method: c.req.method,
        path,
        status,
        durationMs: Date.now() - start,
        owner: c.get('ownerId'),
        desktop: desktopIdFromPath(path),
        environment: c.env.ENVIRONMENT,
      };
      console.log(JSON.stringify(line));
    } catch {
      /* never break a response because logging failed */
    }
  };
}
