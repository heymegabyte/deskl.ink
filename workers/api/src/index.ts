/**
 * deskl.ink Worker API — Milestone 1 skeleton.
 *
 * Hono app exposing a health check and a version endpoint, with a JSON 404
 * fallback. Desktop/session/billing routes land in Milestone 2 behind their
 * respective bindings (see env.ts + wrangler.toml).
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './env.js';
import desktops from './routes/desktops.js';

// Container + registry Durable Objects must be exported from the Worker entry
// so the runtime can instantiate them (classes referenced in wrangler.jsonc
// durable_objects.bindings + migrations.new_sqlite_classes). FedoraDesktop /
// DebianDesktop are per-distro subclasses bound to their own images.
export {
  DesktopContainer,
  FedoraDesktop,
  DebianDesktop,
} from './containers/DesktopContainer.js';
export { DesktopRegistry } from './containers/DesktopRegistry.js';

/** API surface version — bump on breaking contract changes. */
const API_VERSION = 'v1' as const;
/** Package/service version, mirrors the Worker release. */
const SERVICE_VERSION = '0.0.0' as const;

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

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
