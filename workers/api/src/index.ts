/**
 * deskl.ink Worker API — Milestone 1 skeleton.
 *
 * Hono app exposing a health check and a version endpoint, with a JSON 404
 * fallback. Desktop/session/billing routes land in Milestone 2 behind their
 * respective bindings (see env.ts + wrangler.toml).
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { requestLogger, type AppContext } from './observability.js';
import desktops from './routes/desktops.js';

// Container + registry Durable Objects must be exported from the Worker entry
// so the runtime can instantiate them (classes referenced in wrangler.jsonc
// durable_objects.bindings + migrations.new_sqlite_classes). FedoraDesktop /
// DebianDesktop are per-distro subclasses bound to their own images.
// The universal `durable_object`-policy computer DO — the live create path.
export { Computer } from './containers/Computer.js';
export {
  DesktopContainer,
  FedoraDesktop,
  DebianDesktop,
  // Per-size classes (developer/power/heavy × each distro) — distinct instance_type.
  UbuntuDeveloper,
  UbuntuPower,
  UbuntuHeavy,
  FedoraDeveloper,
  FedoraPower,
  FedoraHeavy,
  DebianDeveloper,
  DebianPower,
  DebianHeavy,
  // Headless server form (distro + ttyd, no desktop/VNC).
  UbuntuServer,
  FedoraServer,
  DebianServer,
} from './containers/DesktopContainer.js';
export { DesktopRegistry } from './containers/DesktopRegistry.js';

/** API surface version — bump on breaking contract changes. */
const API_VERSION = 'v1' as const;
/** Package/service version, mirrors the Worker release. */
const SERVICE_VERSION = '0.0.0' as const;

const app = new Hono<AppContext>();

// Correlation id + structured request logging. Mounted FIRST so it wraps every other middleware
// and the handler (total request time + status). See observability.ts.
app.use('*', requestLogger());

app.use('*', cors());

/**
 * Security headers for the control-plane JSON surface.
 *
 * Scoped deliberately to JSON responses (keyed off the response Content-Type) so the
 * proxied remote-desktop surfaces — noVNC under /vnc/*, ttyd under /term/* — pass through
 * UNTOUCHED. Those serve third-party HTML/JS/CSS into same-origin iframes our own SPA
 * embeds; stamping a restrictive CSP or X-Frame-Options on them would break the core
 * product. The SPA document's CSP + HSTS live in apps/web/public/_headers (the static
 * asset layer), which — per Cloudflare — never applies to these Worker responses.
 */
app.use('*', async (c, next) => {
  await next();
  const type = c.res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) return;
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
});

/** Liveness probe. Cheap, binding-free — safe to hit from anywhere. */
app.get('/health', (c) =>
  c.json({
    ok: true,
    service: 'deskl.ink',
    ts: new Date().toISOString(),
  })
);

/** Reports the running API + service version. */
app.get('/api/v1/version', (c) =>
  c.json({
    api: API_VERSION,
    service: SERVICE_VERSION,
    environment: c.env.ENVIRONMENT ?? 'development',
  })
);

/**
 * CSP violation sink (the `report-uri` / `report-to` target from apps/web/public/_headers).
 *
 * Accepts both the legacy `application/csp-report` shape (`{ "csp-report": {...} }`) and the modern
 * Reporting API batch (`[{ type: "csp-violation", body: {...} }]`), drops browser-extension noise,
 * and emits one structured `csp_violation` log per real report (same shape as observability.ts — so
 * the @sentry/cloudflare baseline picks it up once its DSN lands). Always 204: a report sink must
 * never fail the browser's fire-and-forget POST.
 */
app.post('/api/v1/csp-report', async (c) => {
  try {
    const body = await c.req.json<unknown>().catch(() => null);
    const list = Array.isArray(body) ? body : body ? [body] : [];
    for (const entry of list) {
      const e = entry as Record<string, unknown>;
      // report-uri wraps in { "csp-report": {...} }; report-to wraps in { body: {...} }.
      const r = ((e['csp-report'] ?? e['body'] ?? e) ?? {}) as Record<string, unknown>;
      const blocked = String(r['blocked-uri'] ?? r['blockedURL'] ?? '');
      if (/^(chrome|moz|safari|webkit)-extension:/i.test(blocked)) continue; // extension noise
      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: 'warn',
          msg: 'csp_violation',
          requestId: c.get('requestId'),
          blocked,
          directive: r['effectiveDirective'] ?? r['effective-directive'] ?? r['violated-directive'],
          documentUri: r['documentURL'] ?? r['document-uri'],
          sourceFile: r['sourceFile'] ?? r['source-file'],
        })
      );
    }
  } catch {
    /* a report sink must never throw back at the browser */
  }
  return c.body(null, 204);
});

// Desktop control-plane: create/list/get/start/stop/destroy + ticketed VNC proxy.
app.route('/api/v1/desktops', desktops);

/** JSON 404 for every unmatched route — never an HTML body. */
app.notFound((c) =>
  c.json(
    {
      ok: false,
      error: 'not_found',
      message: `No route for ${c.req.method} ${new URL(c.req.url).pathname}`,
    },
    404
  )
);

/** Typed JSON error envelope for uncaught failures. */
app.onError((err, c) => {
  console.error('[deskl.ink api] unhandled error', err);
  return c.json(
    {
      ok: false,
      error: 'internal_error',
      message: 'An unexpected error occurred.',
    },
    500
  );
});

export default app;
