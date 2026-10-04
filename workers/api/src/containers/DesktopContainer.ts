/**
 * DesktopContainer — the live Linux workstation.
 *
 * A Cloudflare Container-enabled Durable Object (one instance per desktop id).
 * It runs the Ubuntu desktop image from `container/ubuntu/Dockerfile`, exposing
 * websockify (noVNC HTML + WebSocket proxy to the local VNC server) on
 * {@link VNC_CONTAINER_PORT}. The control-plane (`routes/desktops.ts`) drives
 * its lifecycle via `getContainer(env.DESKTOP, id)` and proxies VNC traffic to
 * it with `.fetch(switchPort(req, VNC_CONTAINER_PORT))` (NEVER `containerFetch`
 * — only `.fetch` forwards WebSocket upgrades).
 *
 * @remarks
 * - `sleepAfter = '10m'` implements the deskl.ink 10-minute idle auto-stop:
 *   the container hibernates after 10 minutes with no requests. VNC WebSocket
 *   traffic renews the activity timeout, so an in-use desktop never sleeps.
 * - Container DOs REQUIRE SQLite storage — declared via `new_sqlite_classes`
 *   in `wrangler.jsonc` `migrations`.
 */

import { Container } from '@cloudflare/containers';
import { VNC_CONTAINER_PORT } from '@deskl/shared';
import type { Env } from '../env.js';

export class DesktopContainer extends Container<Env> {
  /** websockify (noVNC + ws proxy) port inside the image. See the Dockerfile. */
  override defaultPort = VNC_CONTAINER_PORT;

  /** Idle auto-stop: hibernate 10 min after the last request (VNC ws renews it). */
  override sleepAfter = '10m';

  /** Baseline container env. Per-instance overrides go through `start(startOptions)`. */
  override envVars: Record<string, string> = { VNC_RESOLUTION: '1920x1080' };

  /** Surface container errors to Worker logs; keep the DO default (rethrow). */
  override onError(error: unknown): never {
    console.error('[deskl.ink DesktopContainer] container error', error);
    throw error;
  }

  /** Lifecycle breadcrumb — container reached a running/healthy state. */
  override onStart(): void {
    console.log('[deskl.ink DesktopContainer] started');
  }

  /** Lifecycle breadcrumb — container shut down (idle-stop, stop, or destroy). */
  override onStop(): void {
    console.log('[deskl.ink DesktopContainer] stopped');
  }
}
